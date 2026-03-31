#!/usr/bin/env python3
"""QLoRA fine-tuning entrypoint for calculator-game coding assistant."""

from __future__ import annotations

import argparse
import inspect
import os
from pathlib import Path
from typing import Any

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train QLoRA adapter on game SFT dataset")
    parser.add_argument("--model-name", default="Qwen/Qwen2.5-Coder-7B-Instruct")
    parser.add_argument("--train-file", default="ml/data/processed/train.jsonl")
    parser.add_argument("--eval-file", default="ml/data/processed/val.jsonl")
    parser.add_argument("--output-dir", default="ml/output/qwen-game-qlora")
    parser.add_argument("--max-seq-len", type=int, default=2048)
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--train-batch-size", type=int, default=2)
    parser.add_argument("--eval-batch-size", type=int, default=2)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--warmup-ratio", type=float, default=0.05)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--lora-r", type=int, default=32)
    parser.add_argument("--lora-alpha", type=int, default=64)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--save-steps", type=int, default=100)
    parser.add_argument("--logging-steps", type=int, default=10)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--bf16", action="store_true")
    parser.add_argument("--force-cpu", action="store_true")
    parser.add_argument(
        "--no-4bit",
        action="store_true",
        help="Disable 4-bit loading and use full-precision LoRA path",
    )
    return parser.parse_args()


def render_messages(messages: list[dict[str, Any]], tokenizer: AutoTokenizer) -> str:
    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )

    parts: list[str] = []
    for message in messages:
        role = message.get("role", "user").upper()
        content = str(message.get("content", "")).strip()
        parts.append(f"[{role}] {content}")

    return "\n".join(parts)


def pick_compute_dtype(force_bf16: bool) -> torch.dtype:
    if not torch.cuda.is_available():
        return torch.float32

    if force_bf16:
        return torch.bfloat16

    if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
        return torch.bfloat16

    return torch.float16


def can_use_4bit() -> tuple[bool, str]:
    if not torch.cuda.is_available():
        return False, "CUDA is not available"

    try:
        import bitsandbytes  # noqa: F401
    except Exception as exc:
        return False, f"bitsandbytes import failed: {exc}"

    return True, ""


def detect_lora_target_modules(model: torch.nn.Module) -> list[str]:
    preferred = {
        "q_proj",
        "k_proj",
        "v_proj",
        "o_proj",
        "gate_proj",
        "up_proj",
        "down_proj",
        "c_attn",
        "c_proj",
        "fc_in",
        "fc_out",
    }

    found: set[str] = set()
    for name, _module in model.named_modules():
        leaf = name.rsplit(".", 1)[-1]
        if leaf in preferred:
            found.add(leaf)

    if found:
        return sorted(found)

    # Generic fallback for uncommon architectures.
    for name, module in model.named_modules():
        if not isinstance(module, torch.nn.Linear):
            continue
        leaf = name.rsplit(".", 1)[-1]
        if leaf == "lm_head":
            continue
        found.add(leaf)
        if len(found) >= 8:
            break

    return sorted(found) if found else ["c_attn", "c_proj"]


def main() -> int:
    args = parse_args()

    train_file = Path(args.train_file)
    eval_file = Path(args.eval_file)

    if not train_file.exists():
        raise FileNotFoundError(f"Train file not found: {train_file}")

    data_files: dict[str, str] = {"train": str(train_file)}
    if eval_file.exists():
        data_files["validation"] = str(eval_file)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    use_cuda = torch.cuda.is_available() and not args.force_cpu
    compute_dtype = pick_compute_dtype(args.bf16)

    if use_cuda:
        device_name = torch.cuda.get_device_name(0)
        print(f"[info] CUDA enabled on: {device_name}")
    else:
        print("[warn] CUDA disabled. Running CPU LoRA smoke-train mode.")

    if use_cuda:
        use_4bit = not args.no_4bit
        if use_4bit:
            ok_4bit, reason = can_use_4bit()
            if not ok_4bit:
                print(f"[warn] 4-bit path unavailable, fallback to standard GPU LoRA: {reason}")
                use_4bit = False

        if use_4bit:
            try:
                quant_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_compute_dtype=compute_dtype,
                )

                model = AutoModelForCausalLM.from_pretrained(
                    args.model_name,
                    quantization_config=quant_config,
                    torch_dtype=compute_dtype,
                    device_map="auto",
                )
                model = prepare_model_for_kbit_training(model)
                print("[info] Using 4-bit QLoRA path")
            except Exception as exc:
                print(f"[warn] 4-bit load failed, fallback to standard GPU LoRA: {exc}")
                model = AutoModelForCausalLM.from_pretrained(
                    args.model_name,
                    torch_dtype=compute_dtype,
                )
                model.to("cuda")
                print("[info] Using standard GPU LoRA path")
        else:
            model = AutoModelForCausalLM.from_pretrained(
                args.model_name,
                torch_dtype=compute_dtype,
            )
            model.to("cuda")
            print("[info] Using standard GPU LoRA path")
    else:
        model = AutoModelForCausalLM.from_pretrained(
            args.model_name,
            torch_dtype=torch.float32,
        )
        model.to("cpu")

    model.config.use_cache = False
    target_modules = detect_lora_target_modules(model)
    print(f"[info] LoRA target modules: {target_modules}")

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=target_modules,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)

    dataset = load_dataset("json", data_files=data_files)

    def to_text(example: dict[str, Any]) -> dict[str, Any]:
        messages = example.get("messages", [])
        if not isinstance(messages, list):
            messages = []
        text = render_messages(messages, tokenizer)
        return {"text": text}

    text_dataset = dataset.map(to_text, remove_columns=dataset["train"].column_names)

    def tokenize_batch(batch: dict[str, Any]) -> dict[str, Any]:
        tokenized = tokenizer(
            batch["text"],
            max_length=args.max_seq_len,
            truncation=True,
            padding=False,
        )
        tokenized["labels"] = [ids[:] for ids in tokenized["input_ids"]]
        return tokenized

    train_dataset = text_dataset["train"].map(tokenize_batch, batched=True, remove_columns=["text"])
    eval_dataset = None
    if "validation" in text_dataset:
        eval_dataset = text_dataset["validation"].map(
            tokenize_batch,
            batched=True,
            remove_columns=["text"],
        )

    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    ta_params = inspect.signature(TrainingArguments.__init__).parameters
    training_kwargs: dict[str, Any] = {
        "output_dir": str(output_dir),
        "num_train_epochs": args.epochs,
        "max_steps": args.max_steps,
        "learning_rate": args.learning_rate,
        "per_device_train_batch_size": args.train_batch_size,
        "per_device_eval_batch_size": args.eval_batch_size,
        "gradient_accumulation_steps": args.grad_accum,
        "warmup_ratio": args.warmup_ratio,
        "weight_decay": args.weight_decay,
        "lr_scheduler_type": "cosine",
        "save_strategy": "steps",
        "save_steps": args.save_steps,
        "logging_steps": args.logging_steps,
        "seed": args.seed,
        "eval_steps": args.save_steps if eval_dataset is not None else None,
        "bf16": (use_cuda and compute_dtype == torch.bfloat16),
        "fp16": (use_cuda and compute_dtype == torch.float16),
        "dataloader_num_workers": 0,
        "gradient_checkpointing": use_cuda,
        "report_to": "none",
    }

    if "evaluation_strategy" in ta_params:
        training_kwargs["evaluation_strategy"] = "steps" if eval_dataset is not None else "no"
    elif "eval_strategy" in ta_params:
        training_kwargs["eval_strategy"] = "steps" if eval_dataset is not None else "no"

    if "no_cuda" in ta_params:
        training_kwargs["no_cuda"] = not use_cuda
    elif "use_cpu" in ta_params:
        training_kwargs["use_cpu"] = not use_cuda

    training_args = TrainingArguments(**training_kwargs)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=collator,
    )

    trainer.train()

    adapter_dir = output_dir / "adapter"
    adapter_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))

    print(f"[done] Saved adapter to: {adapter_dir}")
    print("[hint] Use PEFT to load this adapter on top of the base model")

    return 0


if __name__ == "__main__":
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    raise SystemExit(main())
