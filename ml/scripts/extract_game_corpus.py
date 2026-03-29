#!/usr/bin/env python3
"""Build a game-focused corpus from assets and compiler sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Iterable

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".asm",
    ".py",
    ".sh",
    ".bat",
    ".md",
}

SUPPORTED_BASENAMES = {
    "labels",
    "labels_sfr",
    "gadgets",
    "disas.txt",
    "_disas.txt",
}

MODEL_TAG_HINTS = {
    "580vnx": "fx-580vn-x",
    "580vn": "fx-580vn",
    "880btg": "fx-880btg",
    "570": "fx-570",
    "991": "fx-991",
}

TOPIC_TAG_HINTS = {
    "snake": "snake",
    "flappy": "flappy-bird",
    "frog": "frog",
    "dino": "dinosaur",
    "dinosaur": "dinosaur",
    "ping": "ping-pong",
    "pong": "ping-pong",
    "race": "race-game",
    "racing": "race-game",
    "2048": "2048",
    "tetris": "tetris",
    "tug": "tug-of-war",
    "geometry": "geometry-dash",
    "dice": "dice",
    "tai_xiu": "tai-xiu",
    "eat_food": "eat-food",
    "apple": "apple-catcher",
}

DIFFICULTY_HINTS = {
    "hard": ["chi_tiet", "remake", "fix", "advanced", "sieu", "render", "bitmap"],
    "medium": ["tutorial", "update", "ver", "version", "newbie"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract game/compiler corpus from local sources")
    parser.add_argument("--assets-dir", default="guidesnpdf/assets", help="Path to source assets")
    parser.add_argument("--compiler-dir", default="compiler", help="Path to compiler sources")
    parser.add_argument("--output-dir", default="ml/data/raw", help="Output directory")
    parser.add_argument(
        "--keyword-file",
        default="ml/config/game_keywords.txt",
        help="Keyword file (one keyword per line)",
    )
    parser.add_argument("--max-files", type=int, default=0, help="Limit processed files (0 = all)")
    parser.add_argument("--include-all", action="store_true", help="Include non-game files")
    parser.add_argument(
        "--no-compiler",
        action="store_true",
        help="Disable compiler source ingestion",
    )
    parser.add_argument("--min-chars", type=int, default=60, help="Minimum chars to keep a record")
    parser.add_argument("--verbose", action="store_true", help="Print per-file diagnostics")
    return parser.parse_args()


def load_keywords(path: Path) -> list[str]:
    if not path.exists():
        return []

    keywords = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        item = raw.strip().lower()
        if item and not item.startswith("#"):
            keywords.append(item)

    return sorted(set(keywords))


def is_game_file(file_name: str, keywords: Iterable[str]) -> bool:
    lower_name = file_name.lower()
    return any(keyword in lower_name for keyword in keywords)


def infer_tags(source_path: str) -> list[str]:
    lower_name = source_path.lower()
    tags: set[str] = set()

    for key, tag in MODEL_TAG_HINTS.items():
        if key in lower_name:
            tags.add(tag)

    for key, tag in TOPIC_TAG_HINTS.items():
        if key in lower_name:
            tags.add(tag)

    if "game" in lower_name:
        tags.add("game")

    if "tutorial" in lower_name:
        tags.add("tutorial")

    if "/compiler/" in lower_name or lower_name.startswith("compiler/"):
        tags.add("compiler")
    if "ropchain" in lower_name:
        tags.add("rop-chain")
    if "gadgets" in lower_name:
        tags.add("gadgets")
    if "labels" in lower_name:
        tags.add("labels")
    if "disas" in lower_name:
        tags.add("disassembly")
    if lower_name.endswith(".py"):
        tags.add("python-tooling")
    if lower_name.endswith(".asm"):
        tags.add("asm")

    return sorted(tags)


def infer_difficulty(file_name: str) -> str:
    lower_name = file_name.lower()

    for keyword in DIFFICULTY_HINTS["hard"]:
        if keyword in lower_name:
            return "hard"

    for keyword in DIFFICULTY_HINTS["medium"]:
        if keyword in lower_name:
            return "medium"

    return "easy"


def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def read_text_file(path: Path) -> str:
    encodings = ("utf-8", "utf-8-sig", "cp1258", "cp1252", "latin-1")
    for encoding in encodings:
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="ignore")


def extract_docx_text(path: Path) -> str:
    try:
        from docx import Document  # type: ignore
    except Exception as exc:
        raise RuntimeError("python-docx is not installed") from exc

    doc = Document(path)
    return "\n".join(paragraph.text for paragraph in doc.paragraphs if paragraph.text)


def extract_pdf_text(path: Path) -> str:
    errors: list[str] = []

    try:
        import fitz  # type: ignore

        with fitz.open(path) as pdf:
            pages = [page.get_text("text") for page in pdf]
        text = "\n".join(pages)
        if text.strip():
            return text
    except Exception as exc:
        errors.append(f"PyMuPDF failed: {exc}")

    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages)
        if text.strip():
            return text
    except Exception as exc:
        errors.append(f"pypdf failed: {exc}")

    raise RuntimeError("; ".join(errors) if errors else "No PDF backend available")


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix in {".txt", ".asm", ".py", ".sh", ".bat", ".md"}:
        return read_text_file(path)

    if not suffix and path.name.lower() in SUPPORTED_BASENAMES:
        return read_text_file(path)

    if suffix == ".docx":
        return extract_docx_text(path)

    if suffix == ".pdf":
        return extract_pdf_text(path)

    raise ValueError(f"Unsupported extension: {suffix}")


def make_record(path: Path, root: Path, text: str, source_type: str) -> dict:
    relative = path.relative_to(root).as_posix()
    digest = hashlib.sha1(f"{relative}|{text[:400]}|{len(text)}".encode("utf-8")).hexdigest()

    return {
        "id": digest,
        "source_type": source_type,
        "source_path": relative,
        "file_name": path.name,
        "extension": path.suffix.lower(),
        "tags": infer_tags(relative),
        "difficulty_hint": infer_difficulty(path.name),
        "char_count": len(text),
        "text": text,
    }


def collect_files(source_dir: Path) -> list[Path]:
    if not source_dir.exists():
        return []
    return sorted(path for path in source_dir.rglob("*") if path.is_file())


def is_supported_file(path: Path) -> bool:
    suffix = path.suffix.lower()
    if suffix in SUPPORTED_EXTENSIONS:
        return True
    if not suffix and path.name.lower() in SUPPORTED_BASENAMES:
        return True
    return False


def main() -> int:
    args = parse_args()

    workspace = Path.cwd()
    assets_dir = (workspace / args.assets_dir).resolve()
    compiler_dir = (workspace / args.compiler_dir).resolve()
    output_dir = (workspace / args.output_dir).resolve()
    keyword_file = (workspace / args.keyword_file).resolve()

    if not assets_dir.exists():
        print(f"[error] Assets dir not found: {assets_dir}", file=sys.stderr)
        return 1

    keywords = load_keywords(keyword_file)

    source_entries: list[tuple[str, Path]] = []
    source_entries.extend(("assets", path) for path in collect_files(assets_dir))
    if not args.no_compiler:
        source_entries.extend(("compiler", path) for path in collect_files(compiler_dir))

    scanned = 0
    kept = 0
    skipped = 0
    failed = 0
    source_counts: dict[str, int] = defaultdict(int)
    records: list[dict] = []

    for source_type, path in source_entries:
        scanned += 1
        if args.max_files and kept >= args.max_files:
            break

        if not is_supported_file(path):
            skipped += 1
            continue

        if (
            source_type == "assets"
            and not args.include_all
            and keywords
            and not is_game_file(path.name, keywords)
        ):
            skipped += 1
            continue

        try:
            raw_text = extract_text(path)
            text = clean_text(raw_text)
            if len(text) < args.min_chars:
                skipped += 1
                if args.verbose:
                    print(f"[skip] {path.name} has too little text")
                continue

            record = make_record(path, workspace, text, source_type)
            records.append(record)
            kept += 1
            source_counts[source_type] += 1
            if args.verbose:
                print(f"[ok] {record['source_path']} ({record['char_count']} chars)")
        except Exception as exc:
            failed += 1
            if args.verbose:
                print(f"[fail] {source_type}:{path.name}: {exc}")

    output_dir.mkdir(parents=True, exist_ok=True)
    corpus_path = output_dir / "game_corpus.jsonl"
    stats_path = output_dir / "game_corpus_stats.json"

    with corpus_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    stats = {
        "assets_dir": str(assets_dir),
        "records_written": len(records),
        "scanned_files": scanned,
        "skipped_files": skipped,
        "failed_files": failed,
        "keywords_loaded": len(keywords),
        "compiler_enabled": not args.no_compiler,
        "records_by_source": dict(sorted(source_counts.items())),
    }
    stats_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(stats, ensure_ascii=False))
    print(f"[done] Wrote corpus: {corpus_path}")
    print(f"[done] Wrote stats:  {stats_path}")

    if not records:
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
