#!/usr/bin/env python3
"""Convert distilled samples into train/validation/test SFT datasets."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from pathlib import Path
from typing import Any

SYSTEM_PROMPT = (
    "Ban la tro ly lap trinh chuyen calculator game tren CASIO. "
    "Phan tich ro rang, uu tien thuat toan, toi uu bo nho, va huong dan debug tung buoc."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build SFT dataset from distilled candidates")
    parser.add_argument("--input", default="ml/data/distill/sft_candidates.jsonl", help="Input JSONL")
    parser.add_argument("--output-dir", default="ml/data/processed", help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--val-ratio", type=float, default=0.1, help="Validation split ratio")
    parser.add_argument("--test-ratio", type=float, default=0.05, help="Test split ratio")
    parser.add_argument("--min-output-chars", type=int, default=80, help="Minimum output length")
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                print(f"[warn] bad JSON at line {line_no}: {exc}", file=sys.stderr)
                continue
            if isinstance(data, dict):
                rows.append(data)
    return rows


def normalize_text(value: Any, max_len: int) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:max_len]


def dedupe(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()

    for sample in samples:
        key_src = "|".join(
            [
                str(sample.get("instruction", "")),
                str(sample.get("input", "")),
                str(sample.get("output", "")),
            ]
        )
        key = hashlib.sha1(key_src.encode("utf-8")).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        output.append(sample)

    return output


def format_user_prompt(sample: dict[str, Any]) -> str:
    instruction = normalize_text(sample.get("instruction"), 900)
    model_input = normalize_text(sample.get("input"), 2800)
    tags = sample.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    difficulty = normalize_text(sample.get("difficulty", "medium"), 24)

    tags_text = ", ".join(str(item) for item in tags if item) or "game"

    parts = [
        f"Task: {instruction}",
        f"Difficulty: {difficulty}",
        f"Tags: {tags_text}",
    ]

    if model_input:
        parts.append(f"Context: {model_input}")

    return "\n".join(parts)


def to_chat_record(sample: dict[str, Any]) -> dict[str, Any] | None:
    assistant = normalize_text(sample.get("output"), 12000)
    if len(assistant) < 80:
        return None

    record_id = sample.get("id") or hashlib.sha1(
        f"{sample.get('instruction')}|{assistant[:120]}".encode("utf-8")
    ).hexdigest()

    return {
        "id": str(record_id),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": format_user_prompt(sample)},
            {"role": "assistant", "content": assistant},
        ],
        "meta": {
            "source_id": sample.get("source_id"),
            "source_path": sample.get("source_path"),
            "difficulty": sample.get("difficulty", "medium"),
            "tags": sample.get("tags", []),
            "teacher_model": sample.get("teacher_model"),
        },
    }


def split_samples(
    rows: list[dict[str, Any]], seed: int, val_ratio: float, test_ratio: float
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    random.seed(seed)
    work = list(rows)
    random.shuffle(work)

    total = len(work)
    test_size = int(total * test_ratio)
    val_size = int(total * val_ratio)

    test = work[:test_size]
    val = work[test_size : test_size + val_size]
    train = work[test_size + val_size :]
    return train, val, test


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    args = parse_args()

    if args.val_ratio < 0 or args.test_ratio < 0 or (args.val_ratio + args.test_ratio) >= 1:
        print("[error] Invalid split ratios", file=sys.stderr)
        return 1

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"[error] Missing input file: {input_path}", file=sys.stderr)
        return 1

    raw_rows = read_jsonl(input_path)
    if not raw_rows:
        print("[error] No rows read from input", file=sys.stderr)
        return 2

    deduped = dedupe(raw_rows)

    records: list[dict[str, Any]] = []
    for sample in deduped:
        record = to_chat_record(sample)
        if record is None:
            continue
        records.append(record)

    if not records:
        print("[error] No valid records after normalization", file=sys.stderr)
        return 3

    train, val, test = split_samples(records, args.seed, args.val_ratio, args.test_ratio)

    output_dir = Path(args.output_dir)
    train_path = output_dir / "train.jsonl"
    val_path = output_dir / "val.jsonl"
    test_path = output_dir / "test.jsonl"

    write_jsonl(train_path, train)
    write_jsonl(val_path, val)
    write_jsonl(test_path, test)

    stats = {
        "input_rows": len(raw_rows),
        "deduped_rows": len(deduped),
        "records_written": len(records),
        "train_size": len(train),
        "val_size": len(val),
        "test_size": len(test),
        "seed": args.seed,
    }

    stats_path = output_dir / "dataset_stats.json"
    stats_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(stats, ensure_ascii=False))
    print(f"[done] Wrote {train_path}")
    print(f"[done] Wrote {val_path}")
    print(f"[done] Wrote {test_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
