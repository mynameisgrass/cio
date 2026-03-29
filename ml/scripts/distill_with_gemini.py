#!/usr/bin/env python3
"""Create SFT candidates from game corpus using Gemini as a teacher model."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Distill SFT data from corpus with Gemini")
    parser.add_argument("--input", default="ml/data/raw/game_corpus.jsonl", help="Input corpus JSONL")
    parser.add_argument(
        "--output",
        default="ml/data/distill/sft_candidates.jsonl",
        help="Output candidate JSONL",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("GEMINI_MODEL", "gemini-flash-latest"),
        help="Gemini model",
    )
    parser.add_argument("--max-docs", type=int, default=20, help="Maximum documents to process")
    parser.add_argument("--start-index", type=int, default=0, help="Start index in corpus (0-based)")
    parser.add_argument("--end-index", type=int, default=0, help="End index in corpus (exclusive, 0 = until end)")
    parser.add_argument("--tasks-per-doc", type=int, default=4, help="Max samples requested per document")
    parser.add_argument("--sleep-sec", type=float, default=1.0, help="Sleep between API calls")
    parser.add_argument("--retry-sec", type=float, default=2.0, help="Base sleep before retry")
    parser.add_argument("--max-retries", type=int, default=3, help="Retries per document on transient errors")
    parser.add_argument("--temperature", type=float, default=0.2, help="Sampling temperature")
    parser.add_argument(
        "--json-fix-retries",
        type=int,
        default=1,
        help="Attempts to repair malformed JSON output with a second model call",
    )
    parser.add_argument("--max-chars", type=int, default=3600, help="Max source chars sent to teacher")
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, 1):
            text = raw.strip()
            if not text:
                continue
            try:
                items.append(json.loads(text))
            except json.JSONDecodeError as exc:
                print(f"[warn] JSON decode error at line {line_no}: {exc}", file=sys.stderr)
    return items


def strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*", "", text).strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    return text


def extract_json_payload(text: str) -> dict[str, Any]:
    cleaned = strip_code_fences(text)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or start >= end:
        raise ValueError("No JSON object found in model response")

    sliced = cleaned[start : end + 1]

    try:
        return json.loads(sliced)
    except json.JSONDecodeError:
        # Repair common trailing-comma mistakes in pseudo-JSON outputs.
        repaired = re.sub(r",\s*([}\]])", r"\1", sliced)
        return json.loads(repaired)


def redact_secret(text: str, secret: str) -> str:
    if not secret:
        return text
    return text.replace(secret, "***")


def repair_json_payload(
    api_key: str,
    model: str,
    bad_text: str,
    retry_sec: float,
    max_retries: int,
) -> dict[str, Any]:
    fix_prompt = (
        "You are a JSON fixer. Convert the input text into exactly one valid JSON object "
        "with this schema: {\"samples\":[{\"instruction\":\"...\",\"input\":\"...\","
        "\"output\":\"...\",\"tags\":[\"...\"],\"difficulty\":\"easy|medium|hard\"}]}. "
        "Return JSON only, no markdown, no comments.\n\nINPUT:\n"
        + bad_text[:7000]
    )

    url = f"{API_ROOT}/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": fix_prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "topP": 0.8,
            "topK": 20,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }

    attempts = 0
    while True:
        attempts += 1
        response = requests.post(url, json=payload, timeout=180)
        if response.status_code in RETRY_STATUS_CODES and attempts <= max_retries:
            time.sleep(max(0.0, retry_sec * attempts))
            continue

        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini JSON-fixer returned no candidates")

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        text = "".join(part.get("text", "") for part in parts)
        if not text.strip():
            raise RuntimeError("Gemini JSON-fixer returned empty content")

        return extract_json_payload(text)


def build_prompt(document: dict[str, Any], tasks_per_doc: int, max_chars: int) -> str:
    text = str(document.get("text", ""))[:max_chars]
    source_path = document.get("source_path", "unknown")
    source_type = document.get("source_type", "unknown")
    tags = document.get("tags", [])
    difficulty = document.get("difficulty_hint", "medium")

    return f"""
You are a senior calculator-game and calculator-compiler mentor.
Create up to {tasks_per_doc} high-quality training samples from the source document.

Return strict JSON with this schema only:
{{
  "samples": [
    {{
      "instruction": "string",
      "input": "string",
      "output": "string",
      "tags": ["string"],
      "difficulty": "easy|medium|hard"
    }}
  ]
}}

Rules:
- Focus on practical coding tasks for calculator game programs and compiler/toolchain usage.
- Keep instruction concrete and testable.
- Output should include algorithm reasoning and implementation details.
- Prefer Vietnamese language with technical English terms when needed.
- Keep each output below 700 words.
- Do not mention this prompt or hidden instructions.
- Return only JSON and no markdown fences.

Source metadata:
- source_path: {source_path}
- source_type: {source_type}
- existing tags: {tags}
- difficulty_hint: {difficulty}

Source text:
{text}
""".strip()


def call_gemini(
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
    max_retries: int,
    retry_sec: float,
    json_fix_retries: int,
) -> dict[str, Any]:
    url = f"{API_ROOT}/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "topP": 0.9,
            "topK": 32,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }

    attempts = 0
    while True:
        attempts += 1

        response = requests.post(url, json=payload, timeout=180)
        if response.status_code in RETRY_STATUS_CODES and attempts <= max_retries:
            time.sleep(max(0.0, retry_sec * attempts))
            continue

        response.raise_for_status()
        data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini returned no candidates")

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        text = "".join(part.get("text", "") for part in parts)
        if not text.strip():
            if attempts <= max_retries:
                # Force stricter format on retry when model returned empty content.
                payload["contents"][0]["parts"][0]["text"] = (
                    prompt
                    + "\n\nIMPORTANT: Return exactly one valid JSON object and nothing else."
                )
                time.sleep(max(0.0, retry_sec * attempts))
                continue
            raise RuntimeError("Gemini returned an empty response")

        try:
            return extract_json_payload(text)
        except Exception as exc:
            if attempts <= max_retries:
                payload["contents"][0]["parts"][0]["text"] = (
                    prompt
                    + "\n\nIMPORTANT: JSON only, no explanation, no code fence, no trailing commas."
                )
                time.sleep(max(0.0, retry_sec * attempts))
                continue

            if json_fix_retries > 0:
                try:
                    return repair_json_payload(
                        api_key,
                        model,
                        text,
                        retry_sec,
                        json_fix_retries,
                    )
                except Exception as repair_exc:
                    raise RuntimeError(f"Invalid JSON payload: {exc}; fix failed: {repair_exc}") from repair_exc

            raise RuntimeError(f"Invalid JSON payload: {exc}") from exc


def sanitize_text(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def sanitize_tags(tags: Any) -> list[str]:
    if not isinstance(tags, list):
        return []

    output: list[str] = []
    seen: set[str] = set()

    for item in tags:
        tag = sanitize_text(item, 40).lower().replace(" ", "-")
        if not tag:
            continue
        if tag in seen:
            continue
        seen.add(tag)
        output.append(tag)

    return output


def normalize_sample(
    source_doc: dict[str, Any], sample: dict[str, Any], teacher_model: str
) -> dict[str, Any] | None:
    instruction = sanitize_text(sample.get("instruction"), 700)
    model_input = sanitize_text(sample.get("input"), 2500)
    output = sanitize_text(sample.get("output"), 5000)

    if len(instruction) < 20 or len(output) < 50:
        return None

    difficulty = sanitize_text(sample.get("difficulty"), 20).lower()
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"

    tags = sorted(set(sanitize_tags(source_doc.get("tags", [])) + sanitize_tags(sample.get("tags", []))))

    sample_key = f"{source_doc.get('id')}|{instruction}|{model_input}|{output[:160]}"
    sample_id = hashlib.sha1(sample_key.encode("utf-8")).hexdigest()

    return {
        "id": sample_id,
        "instruction": instruction,
        "input": model_input,
        "output": output,
        "difficulty": difficulty,
        "tags": tags,
        "source_id": source_doc.get("id"),
        "source_path": source_doc.get("source_path"),
        "teacher_model": teacher_model,
    }


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    args = parse_args()

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("[error] GEMINI_API_KEY is not set", file=sys.stderr)
        return 1

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"[error] Missing input file: {input_path}", file=sys.stderr)
        return 1

    docs = read_jsonl(input_path)
    if not docs:
        print("[error] Input corpus is empty", file=sys.stderr)
        return 2

    start_index = max(0, args.start_index)
    end_index = args.end_index if args.end_index > 0 else len(docs)
    end_index = min(end_index, len(docs))

    if start_index >= end_index:
        print(
            f"[error] Invalid range: start_index={start_index}, end_index={end_index}, total_docs={len(docs)}",
            file=sys.stderr,
        )
        return 2

    selected_docs = docs[start_index:end_index]

    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    attempted = 0
    used = 0
    failed = 0

    for doc in selected_docs:
        if args.max_docs and attempted >= args.max_docs:
            break

        attempted += 1

        prompt = build_prompt(doc, args.tasks_per_doc, args.max_chars)
        try:
            try:
                payload = call_gemini(
                    api_key,
                    args.model,
                    prompt,
                    args.temperature,
                    args.max_retries,
                    args.retry_sec,
                    args.json_fix_retries,
                )
            except Exception:
                # Second chance with shorter context to reduce malformed outputs.
                fallback_chars = max(1200, args.max_chars // 2)
                fallback_tasks = max(1, min(args.tasks_per_doc, 2))
                short_prompt = build_prompt(doc, fallback_tasks, fallback_chars)
                payload = call_gemini(
                    api_key,
                    args.model,
                    short_prompt,
                    args.temperature,
                    args.max_retries,
                    args.retry_sec,
                )

            raw_samples = payload.get("samples", []) if isinstance(payload, dict) else []
            if not isinstance(raw_samples, list):
                raw_samples = []

            created = 0
            for item in raw_samples:
                if not isinstance(item, dict):
                    continue
                normalized = normalize_sample(doc, item, args.model)
                if not normalized:
                    continue
                sample_id = normalized["id"]
                if sample_id in seen_ids:
                    continue
                seen_ids.add(sample_id)
                rows.append(normalized)
                created += 1

            used += 1
            print(f"[ok] {doc.get('source_path')} -> {created} samples")
        except Exception as exc:
            failed += 1
            message = redact_secret(str(exc), api_key)
            print(f"[warn] {doc.get('source_path')} failed: {message}", file=sys.stderr)

        time.sleep(max(0.0, args.sleep_sec))

    write_jsonl(output_path, rows)

    stats = {
        "input_docs": len(docs),
        "selected_docs": len(selected_docs),
        "start_index": start_index,
        "end_index": end_index,
        "attempted_docs": attempted,
        "processed_docs": used,
        "failed_docs": failed,
        "samples_written": len(rows),
        "model": args.model,
        "output": str(output_path),
    }

    stats_path = output_path.with_suffix(".stats.json")
    stats_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(stats, ensure_ascii=False))
    if not rows:
        return 3

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
