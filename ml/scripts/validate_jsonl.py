#!/usr/bin/env python3
"""Validate JSONL structure and required fields."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate JSONL file")
    parser.add_argument("--input", required=True, help="Input JSONL file")
    parser.add_argument(
        "--required-fields",
        nargs="*",
        default=[],
        help="Required top-level fields",
    )
    parser.add_argument("--max-errors", type=int, default=20, help="Stop after this many errors")
    return parser.parse_args()


def has_field(data: dict[str, Any], field: str) -> bool:
    return field in data and data[field] not in (None, "")


def main() -> int:
    args = parse_args()
    path = Path(args.input)

    if not path.exists():
        print(f"[error] File not found: {path}", file=sys.stderr)
        return 1

    checked = 0
    failures = 0

    with path.open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, 1):
            raw = raw.strip()
            if not raw:
                continue

            checked += 1
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError as exc:
                failures += 1
                print(f"[error] line {line_no}: invalid JSON ({exc})", file=sys.stderr)
                if failures >= args.max_errors:
                    break
                continue

            if not isinstance(payload, dict):
                failures += 1
                print(f"[error] line {line_no}: record is not a JSON object", file=sys.stderr)
                if failures >= args.max_errors:
                    break
                continue

            missing = [field for field in args.required_fields if not has_field(payload, field)]
            if missing:
                failures += 1
                print(
                    f"[error] line {line_no}: missing required fields: {', '.join(missing)}",
                    file=sys.stderr,
                )
                if failures >= args.max_errors:
                    break

    if checked == 0:
        print("[error] File has no records", file=sys.stderr)
        return 2

    print(f"[done] checked={checked} failures={failures}")
    return 0 if failures == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
