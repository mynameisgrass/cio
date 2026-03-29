#!/usr/bin/env python3
"""Quick generation smoke test for a base model or base+adapter."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke evaluation for game coding model")
    parser.add_argument("--model-name", default="Qwen/Qwen2.5-Coder-7B-Instruct")
    parser.add_argument("--adapter-dir", default="", help="Optional PEFT adapter path")
    parser.add_argument("--eval-file", default="ml/data/processed/test.jsonl")
    parser.add_argument("--output", default="ml/data/processed/smoke_eval_outputs.jsonl")
    parser.add_argument("--max-samples", type=int, default=8)
    parser.add_argument("--max-new-tokens", type=int, default=500)
    parser.add_argument("--temperature", type=float, default=0.6)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            raw = raw.strip()
            if not raw:
                continue
            data = json.loads(raw)
            if isinstance(data, dict):
                rows.append(data)
    return rows


def render_prompt(messages: list[dict[str, Any]], tokenizer: AutoTokenizer) -> str:
    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

    lines = []
    for message in messages:
        role = message.get("role", "user")
        content = str(message.get("content", "")).strip()
        lines.append(f"{role}: {content}")
    lines.append("assistant:")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()

    eval_path = Path(args.eval_file)
    if not eval_path.exists():
        raise FileNotFoundError(f"Eval file missing: {eval_path}")

    samples = read_jsonl(eval_path)[: args.max_samples]
    if not samples:
        raise RuntimeError("No samples available for evaluation")

    tokenizer = AutoTokenizer.from_pretrained(args.model_name, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        torch_dtype="auto",
        device_map="auto",
    )

    if args.adapter_dir:
        model = PeftModel.from_pretrained(model, args.adapter_dir)

    output_rows = []

    for sample in samples:
        messages = sample.get("messages", [])
        prompt = render_prompt(messages[:-1], tokenizer) if len(messages) > 1 else render_prompt(messages, tokenizer)

        model_inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        output_ids = model.generate(
            **model_inputs,
            max_new_tokens=args.max_new_tokens,
            do_sample=True,
            temperature=args.temperature,
            top_p=0.95,
            top_k=20,
            pad_token_id=tokenizer.eos_token_id,
        )

        completion_ids = output_ids[0][model_inputs["input_ids"].shape[1] :]
        prediction = tokenizer.decode(completion_ids, skip_special_tokens=True).strip()

        expected = ""
        if messages and isinstance(messages[-1], dict):
            expected = str(messages[-1].get("content", ""))

        output_rows.append(
            {
                "id": sample.get("id"),
                "prompt": prompt,
                "expected": expected,
                "prediction": prediction,
            }
        )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for row in output_rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"[done] Wrote smoke results to: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
