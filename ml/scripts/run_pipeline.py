#!/usr/bin/env python3
"""One-command pipeline: extract -> distill (optional parallel shards) -> build SFT dataset."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run full ML data pipeline in one command")
    parser.add_argument("--model", default="gemini-flash-latest", help="Gemini teacher model")
    parser.add_argument("--assets-dir", default="guidesnpdf/assets")
    parser.add_argument("--compiler-dir", default="compiler")
    parser.add_argument("--output-raw", default="ml/data/raw")
    parser.add_argument("--output-distill", default="ml/data/distill")
    parser.add_argument("--output-processed", default="ml/data/processed")
    parser.add_argument("--tasks-per-doc", type=int, default=2)
    parser.add_argument("--max-docs", type=int, default=0, help="0 means all docs")
    parser.add_argument("--sleep-sec", type=float, default=0.2)
    parser.add_argument("--max-retries", type=int, default=3)
    parser.add_argument("--retry-sec", type=float, default=1.2)
    parser.add_argument("--json-fix-retries", type=int, default=1)
    parser.add_argument("--shards", type=int, default=2, help="Parallel shard count for distillation")
    parser.add_argument("--no-compiler", action="store_true")
    parser.add_argument(
        "--include-all-assets",
        action="store_true",
        help="Include all assets files (not only keyword-matched game files)",
    )
    parser.add_argument("--skip-distill", action="store_true")
    return parser.parse_args()


def run_step(command: list[str], env: dict[str, str] | None = None) -> None:
    printable = " ".join(command)
    print(f"[run] {printable}")
    completed = subprocess.run(command, env=env, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed ({completed.returncode}): {printable}")


def count_jsonl_rows(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                count += 1
    return count


def split_ranges(total: int, shards: int) -> list[tuple[int, int]]:
    shards = max(1, shards)
    if total <= 0:
        return []

    base = total // shards
    remainder = total % shards

    ranges: list[tuple[int, int]] = []
    start = 0
    for shard_idx in range(shards):
        size = base + (1 if shard_idx < remainder else 0)
        end = start + size
        if start < end:
            ranges.append((start, end))
        start = end

    return ranges


def merge_jsonl_files(parts: list[Path], output_path: Path) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    written = 0

    with output_path.open("w", encoding="utf-8") as out:
        for part in parts:
            if not part.exists():
                continue
            with part.open("r", encoding="utf-8") as handle:
                for raw in handle:
                    text = raw.strip()
                    if not text:
                        continue
                    try:
                        payload = json.loads(text)
                    except json.JSONDecodeError:
                        continue
                    sample_id = str(payload.get("id", "")).strip()
                    key = sample_id or text
                    if key in seen:
                        continue
                    seen.add(key)
                    out.write(json.dumps(payload, ensure_ascii=False) + "\n")
                    written += 1

    return written


def run_distill_shards(args: argparse.Namespace, env: dict[str, str], corpus_path: Path) -> Path:
    distill_dir = Path(args.output_distill)
    distill_dir.mkdir(parents=True, exist_ok=True)

    total_docs = count_jsonl_rows(corpus_path)
    if total_docs == 0:
        raise RuntimeError("Corpus is empty, cannot distill")

    if args.max_docs > 0:
        total_docs = min(total_docs, args.max_docs)

    ranges = split_ranges(total_docs, args.shards)
    if not ranges:
        raise RuntimeError("No shard range available")

    processes: list[tuple[subprocess.Popen[str], Path, Path, int, int]] = []

    for index, (start, end) in enumerate(ranges, 1):
        part_output = distill_dir / f"sft_candidates_part{index}.jsonl"
        part_log = distill_dir / f"part{index}.log"

        command = [
            sys.executable,
            "ml/scripts/distill_with_gemini.py",
            "--input",
            str(corpus_path),
            "--output",
            str(part_output),
            "--model",
            args.model,
            "--start-index",
            str(start),
            "--end-index",
            str(end),
            "--max-docs",
            "0",
            "--tasks-per-doc",
            str(args.tasks_per_doc),
            "--sleep-sec",
            str(args.sleep_sec),
            "--max-retries",
            str(args.max_retries),
            "--retry-sec",
            str(args.retry_sec),
            "--json-fix-retries",
            str(args.json_fix_retries),
        ]

        log_handle = part_log.open("w", encoding="utf-8")
        process = subprocess.Popen(
            command,
            env=env,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            text=True,
        )
        processes.append((process, part_output, part_log, start, end))
        print(f"[spawn] shard={index} range={start}:{end} pid={process.pid}")

    failed = []
    part_paths: list[Path] = []

    for process, part_output, part_log, start, end in processes:
        code = process.wait()
        if code != 0:
            failed.append((part_log, code, start, end))
        part_paths.append(part_output)

    if failed:
        messages = [
            f"shard {start}:{end} failed with code {code}, see {log}"
            for log, code, start, end in failed
        ]
        raise RuntimeError("; ".join(messages))

    merged_output = distill_dir / "sft_candidates.jsonl"
    merged_count = merge_jsonl_files(part_paths, merged_output)

    stats = {
        "model": args.model,
        "total_docs": total_docs,
        "shards": len(ranges),
        "ranges": ranges,
        "samples_written": merged_count,
        "output": str(merged_output),
    }
    stats_path = distill_dir / "sft_candidates.stats.json"
    stats_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"[done] merged candidates: {merged_count}")
    print(f"[done] merged stats: {stats_path}")

    return merged_output


def main() -> int:
    args = parse_args()

    env = os.environ.copy()

    extract_command = [
        sys.executable,
        "ml/scripts/extract_game_corpus.py",
        "--assets-dir",
        args.assets_dir,
        "--compiler-dir",
        args.compiler_dir,
        "--output-dir",
        args.output_raw,
    ]
    if args.no_compiler:
        extract_command.append("--no-compiler")
    if args.include_all_assets:
        extract_command.append("--include-all")

    run_step(extract_command, env=env)

    corpus_path = Path(args.output_raw) / "game_corpus.jsonl"
    if not corpus_path.exists():
        raise RuntimeError(f"Missing corpus output: {corpus_path}")

    if args.skip_distill:
        distill_output = Path(args.output_distill) / "sft_candidates.jsonl"
        if not distill_output.exists():
            raise RuntimeError("--skip-distill is set but sft_candidates.jsonl does not exist")
    else:
        if not env.get("GEMINI_API_KEY", "").strip():
            raise RuntimeError("GEMINI_API_KEY is not set")
        distill_output = run_distill_shards(args, env, corpus_path)

    run_step(
        [
            sys.executable,
            "ml/scripts/build_sft_dataset.py",
            "--input",
            str(distill_output),
            "--output-dir",
            args.output_processed,
        ],
        env=env,
    )

    print("[done] Pipeline complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
