#!/usr/bin/env python
"""Bulk-ingest a folder of JD PDFs into the RAG knowledge corpus.

Resumable and idempotent: already-ingested files (by content hash of the
extracted text) are skipped, so re-running after a crash, Ctrl-C, or with
new files added to the folder is always safe.

Usage (inside the backend container):

    python scripts/bulk_ingest_knowledge.py --source-dir /tmp/jds [--recursive]
        [--concurrency 4] [--ocr-concurrency 2] [--dry-run] [--report-dir .]

Outputs failed_files.csv (anything that didn't parse/embed) and
ocr_files.csv (documents that took the OCR path — worth a quality
spot-check) into --report-dir.

Design: docs/superpowers/specs/2026-07-05-bulk-jd-corpus-rag-ingestion-design.md
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
import time
from pathlib import Path

# Allow running as `python scripts/bulk_ingest_knowledge.py` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import AsyncSessionFactory  # noqa: E402
from app.services import parser_service  # noqa: E402
from app.services.parser_service import ExtractionResult, ParseError  # noqa: E402
from app.services.rag import embedding_provider, indexing_service  # noqa: E402
from app.services.rag.indexing_service import IngestResult  # noqa: E402


def discover_files(source_dir: Path, recursive: bool) -> list[Path]:
    pattern = "**/*" if recursive else "*"
    return sorted(
        path
        for path in source_dir.glob(pattern)
        if path.is_file() and indexing_service.file_type_for(path.name) is not None
    )


async def process_file(
    path: Path,
    *,
    ocr_semaphore: asyncio.Semaphore,
    dry_run: bool,
) -> IngestResult:
    filename = path.name
    file_type = indexing_service.file_type_for(filename)
    assert file_type is not None  # discover_files() guarantees this

    try:
        content = path.read_bytes()
    except OSError as exc:
        return IngestResult(filename=filename, status="failed", error=f"Cannot read file: {exc}")

    # Native extraction first (fast, I/O-bound). Only when a PDF has no
    # text layer do we retry with OCR — through the smaller OCR pool,
    # because rasterize + Tesseract is CPU-bound and much slower per file.
    try:
        extraction = await asyncio.to_thread(
            parser_service.extract_text_detailed, content, file_type, False
        )
    except ParseError as first_error:
        if "no extractable text" not in str(first_error):
            return IngestResult(filename=filename, status="failed", error=str(first_error))
        async with ocr_semaphore:
            try:
                extraction = await asyncio.to_thread(
                    parser_service.extract_text_detailed, content, file_type, True
                )
            except ParseError as ocr_error:
                return IngestResult(
                    filename=filename, status="failed", error=f"OCR fallback failed: {ocr_error}"
                )

    async with AsyncSessionFactory() as db:
        return await indexing_service.ingest_extracted_text(
            db,
            filename=filename,
            extraction=ExtractionResult(text=extraction.text, method=extraction.method),
            dry_run=dry_run,
            extra_metadata={"source_path": str(path)},
        )


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--ocr-concurrency", type=int, default=2)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report-dir", type=Path, default=Path("."))
    args = parser.parse_args()

    if not args.source_dir.is_dir():
        print(f"error: --source-dir {args.source_dir} is not a directory", file=sys.stderr)
        return 2

    if not args.dry_run:
        try:
            embedding_provider.require_embeddings_enabled()
        except embedding_provider.EmbeddingError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2

    files = discover_files(args.source_dir, args.recursive)
    if not files:
        print(f"No PDF/DOCX files found in {args.source_dir}")
        return 0
    print(f"Found {len(files)} file(s) in {args.source_dir}"
          f"{' (dry run — no writes, no embedding calls)' if args.dry_run else ''}")

    started = time.monotonic()
    pool = asyncio.Semaphore(max(args.concurrency, 1))
    ocr_pool = asyncio.Semaphore(max(args.ocr_concurrency, 1))
    results: list[IngestResult] = []
    done = 0

    async def bounded(path: Path) -> None:
        nonlocal done
        async with pool:
            result = await process_file(path, ocr_semaphore=ocr_pool, dry_run=args.dry_run)
        results.append(result)
        done += 1
        marker = {"ingested": "+", "skipped": "=", "dry_run": "~"}.get(result.status, "!")
        detail = f" [{result.error}]" if result.error else ""
        print(f"[{done}/{len(files)}] {marker} {result.filename}"
              f" ({result.status}, {result.extraction_method or '-'},"
              f" {result.chunk_count} chunks){detail}")

    await asyncio.gather(*(bounded(path) for path in files))

    ingested = [r for r in results if r.status == "ingested"]
    dry = [r for r in results if r.status == "dry_run"]
    skipped = [r for r in results if r.status == "skipped"]
    failed = [r for r in results if r.status == "failed"]
    via_ocr = [r for r in results if r.extraction_method == "ocr" and r.status != "failed"]
    total_chunks = sum(r.chunk_count for r in results)

    args.report_dir.mkdir(parents=True, exist_ok=True)
    if failed:
        failed_csv = args.report_dir / "failed_files.csv"
        with failed_csv.open("w", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["filename", "error"])
            writer.writerows((r.filename, r.error or "") for r in failed)
        print(f"\nWrote {failed_csv} ({len(failed)} files)")
    if via_ocr:
        ocr_csv = args.report_dir / "ocr_files.csv"
        with ocr_csv.open("w", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["filename"])
            writer.writerows((r.filename,) for r in via_ocr)
        print(f"Wrote {ocr_csv} ({len(via_ocr)} files) — spot-check these for OCR quality")

    elapsed = time.monotonic() - started
    print(
        f"\nDone in {elapsed:.1f}s — "
        + (f"{len(dry)} would ingest" if args.dry_run else f"{len(ingested)} ingested")
        + f" ({len(via_ocr)} via OCR), {len(skipped)} skipped (already ingested), "
        f"{len(failed)} failed, {total_chunks} chunks"
    )
    return 1 if failed and not ingested and not skipped and not dry else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
