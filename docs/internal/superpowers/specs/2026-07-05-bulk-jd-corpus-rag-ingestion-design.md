# Bulk JD Corpus RAG Ingestion — Design

Date: 2026-07-05
Status: **Implemented 2026-07-07** — see the Runbook section at the bottom for how to ingest.
Relates to: `docs/langchain-rag-implementation-plan-2026-06-28.md` (the full RAG architecture)

## Purpose

The owner has 700 job-description PDFs — mostly clean text, but an unknown subset may be scanned
images with no text layer — they want turned into a searchable RAG knowledge corpus —
reference/grounding data, not live product `JobDescription` records. This design covers only what
the 2026-06-28 plan left unspecified: how to actually get 700 files into the system efficiently,
safely, and resumably, including files that need OCR.

This is a slice of that existing plan, not a replacement for it. It executes Phases 0–3 (plus a
light Phase 4), scoped to this one corpus. Phase 5 (wiring RAG into question-generation or
evaluation) is explicitly **out of scope** — the owner wants the corpus built and retrievable
first, before any product workflow depends on it.

## Decisions Made

- **Corpus content**: job description PDFs only. No candidate PII involved (JDs describe roles,
  not people), so `pii_classification = none` on ingested documents unless a later manual review
  finds otherwise.
- **Goal**: build a retrievable knowledge corpus only. Do not create `JobDescription` rows, do not
  run skill extraction or test generation against these files.
- **Source format**: local folder of PDFs, mostly text-layer. Some may be scans — detect per file
  (don't assume), OCR-fallback automatically, and flag which documents took that path so OCR
  output (noisier than native extraction) can be spot-checked afterward.
- **Ingestion mechanism**: standalone CLI script calling the RAG service layer directly (not ARQ,
  not an admin UI upload flow) — see "Approaches Considered" below.
- **Schema**: reuse `KnowledgeDocument` / `KnowledgeChunk` from the existing plan as-is, tagged
  `source_type="jd_corpus"`. No schema changes.

## Approaches Considered

| Approach | Verdict |
|---|---|
| **A. Standalone CLI script**, calling `indexing_service` directly, bounded concurrency, resumable by content hash | **Chosen.** Simplest to observe/debug for a one-time 700-file batch; the same service code the future admin UI (Phase 6) will call, so nothing here is throwaway. |
| B. Enqueue each PDF as an ARQ job | Rejected for this batch — ARQ's queue infra adds indirection for a one-shot 700-item run (harder to get one unified progress view; not built for firing hundreds of jobs as a single tracked batch). Worth revisiting later if bulk imports become a recurring need. |
| C. Admin UI bulk-upload feature | Rejected — new frontend surface for a one-time operation. Revisit only if bulk corpus imports become routine. |

## Architecture

Extends the existing plan's proposed modules; nothing here changes that architecture, it just
specifies the ingestion entry point:

```
backend/scripts/bulk_ingest_knowledge.py   (new — CLI entry point)
backend/scripts/query_knowledge.py         (new — retrieval spot-check CLI)
backend/app/services/rag/indexing_service.py    (from existing plan; script's only dependency)
backend/app/services/rag/chunking_service.py    (from existing plan)
backend/app/services/rag/embedding_provider.py  (from existing plan)
backend/app/services/rag/retrieval_service.py   (from existing plan; light version for spot-checks)
backend/app/db/models/knowledge.py              (from existing plan: KnowledgeDocument, KnowledgeChunk)
backend/app/services/parser_service.py          (existing — gets an opt-in OCR fallback, see below)
```

### OCR fallback (new — root-caused into the shared parser, not the script)

`parser_service.extract_text()` already detects empty extraction and raises `ParseError` with the
message "If this is a scanned PDF, OCR is not currently supported." That's the exact condition to
hook. Rather than reimplement PDF handling in the bulk script, extend the shared function:

```
extract_text(content: bytes, file_type: FileType, allow_ocr: bool = False) -> str
```

- Default (`allow_ocr=False`) preserves today's behavior everywhere else — the live JD-upload
  endpoint (`jd.py`/`jd_service.py`) keeps rejecting scanned PDFs with a clear error, unchanged.
  This is a live product decision the owner hasn't asked to change.
- The bulk ingestion script is the one caller that passes `allow_ocr=True`.
- When native PyMuPDF extraction yields empty text (the same whitespace-only check
  `extract_text()` already does today — no new threshold) **and** `allow_ocr=True`: rasterize
  each page via PyMuPDF's own `page.get_pixmap()` (no new PDF library needed) and run each page
  image through `pytesseract`. Concatenate per-page OCR text the same way native extraction
  concatenates per-page text.
- Record which path was used (`extraction_method: "native" | "ocr"`) in `KnowledgeDocument
  .metadata_json`, and count OCR-fallback documents separately in the run summary — OCR text is
  noisier (misrecognized characters, lost layout), so the owner can spot-check exactly those
  documents rather than the whole 700.

New dependencies:

- `pytesseract` (Python binding) — add to `backend/requirements.txt`.
- `tesseract-ocr` system package — add to the **runtime** stage of `backend/Dockerfile` (next to
  the existing `curl` install); no builder-stage change needed since it's a runtime binary, not a
  compiled wheel dependency.

## Data Flow — `bulk_ingest_knowledge.py`

```
--source-dir <folder> [--recursive] [--concurrency 4] [--ocr-concurrency 2] [--dry-run]

for each PDF file (bounded concurrency pool, default 4 in flight):
    1. Extract text natively: extract_text(content, PDF, allow_ocr=True)
       - if native extraction succeeds → extraction_method = "native"
       - if native extraction is empty → OCR fallback kicks in inside the same call:
         rasterize each page (PyMuPDF get_pixmap) → pytesseract → extraction_method = "ocr"
         (routed through the smaller --ocr-concurrency pool — CPU-bound, slower per file)
       - if OCR also yields nothing → ParseError, file goes to failed_files.csv
    2. Compute content_hash (sha256 of extracted text)
    3. If a KnowledgeDocument with this content_hash already exists → skip (resumable, idempotent)
    4. Chunk text (chunking_service — paragraph/recursive strategy from the existing plan)
    5. [--dry-run stops here: print chunk count/sizes/sample/extraction_method, no DB writes, no
       embedding calls]
    6. Embed each chunk (embedding_provider → local Ollama)
    7. Write KnowledgeDocument (incl. extraction_method in metadata_json) + all its KnowledgeChunk
       rows in a single DB transaction (a mid-file failure never leaves a half-indexed document)

On completion, print/log:
    - N succeeded (of which N via OCR), N skipped (already ingested), N failed
    - total chunks created
    - failed_files.csv (filename, error message) for anything that didn't parse/embed
    - ocr_files.csv (filename) — the ones worth a quality spot-check
```

Concurrency defaults are chosen for the local single-GPU Ollama setup
(`OLLAMA_NUM_PARALLEL=1` per `docker-compose.yml`) and a shared CPU: `--concurrency 4` for the
native-text path (I/O-bound: extraction + embedding calls), `--ocr-concurrency 2` for the OCR
fallback path (CPU-bound: rasterizing + Tesseract per page, meaningfully slower per file). Both
configurable if hardware changes.

## Error Handling

- A single corrupt/empty/unparseable PDF is caught, logged to `failed_files.csv`, and does not
  abort the batch.
- A transaction failure on one file (e.g. DB constraint violation) rolls back only that file's
  rows; other files are unaffected.
- Re-running the script (after a crash, Ctrl-C, or just to pick up new files dropped into the
  folder later) is always safe — already-ingested files are skipped by content hash.

## Retrieval Validation (light Phase 3)

`retrieval_service.search(query, top_k)` — metadata-filtered pgvector similarity search, returning
chunk text + similarity score + source document title, matching the existing plan's citation
requirements.

`backend/scripts/query_knowledge.py "<query>" --top-k 5` — a CLI so the owner can immediately
spot-check corpus quality once ingestion finishes, before any product code depends on it.

## Testing

- Chunking is deterministic for the same input text (same chunk boundaries on repeat runs).
- Re-running ingestion on an already-ingested folder creates zero new rows (dedup works).
- One corrupted/empty PDF in a batch does not stop the other files from being ingested.
- A synthetic image-only PDF (no text layer) triggers the OCR fallback and produces non-empty
  `extraction_method="ocr"` text; a normal text PDF never invokes OCR (verifies the fallback only
  fires when native extraction is actually empty, not on every file — keeps the common case fast).
- The live JD-upload endpoint's existing behavior (reject scanned PDFs) is unchanged — a regression
  test on `extract_text(..., allow_ocr=False)` still raises `ParseError` for an image-only PDF.

## Explicitly Out of Scope

- Any change to the `JobDescription` product flow, skill extraction, or test generation.
- Improving OCR quality beyond Tesseract defaults (no image preprocessing, deskew, or
  multi-language packs) — add only if the OCR spot-check turns up a real accuracy problem.
- Phase 5+ from the existing plan (AI-workflow integration, admin UX, production hardening) —
  revisit once this corpus exists and retrieval quality has been spot-checked.

## Open Questions

- Final embedding model/dimension — the existing plan defers this to Phase 0 corpus review;
  default to whatever `ollama_embedding_model` is already configured in `backend/app/config.py`
  unless the owner wants to evaluate alternatives first.
- Whether any of the 700 JDs contain hiring-manager names/emails inside the document body (would
  bump `pii_classification` above `none` for those specific documents) — worth a quick manual spot
  check on a sample before the full run, not a blocking concern.
- Mixed documents where some pages have a text layer and others are scanned images (e.g. a scan
  bound into an otherwise-native PDF): the whole-document empty-check won't catch these, so they'd
  ingest as "native" with partial content and no OCR fallback. Not solved speculatively — check
  `ocr_files.csv` plus a manual skim of a few `native` documents after the first real run, and only
  add per-page detection if this turns out to actually occur in the corpus.

## Runbook (added at implementation)

One-time prerequisites on the server:

```bash
ollama pull nomic-embed-text        # 274MB embedding model, CPU-friendly
```

Ingest a folder of JDs (e.g. `~/Desktop/talvyn/talvyn-main/jds`):

```bash
cd ~/Desktop/talvyn/talvyn-main

# 1. Copy the folder into the backend container
docker compose cp ./jds backend:/tmp/jds

# 2. Preview what would happen — parses everything, no DB writes, no embeddings
docker compose exec -e EMBEDDING_ENABLED=true backend \
  python scripts/bulk_ingest_knowledge.py --source-dir /tmp/jds --dry-run

# 3. Real run (resumable — rerun anytime; already-ingested files are skipped)
docker compose exec -e EMBEDDING_ENABLED=true backend \
  python scripts/bulk_ingest_knowledge.py --source-dir /tmp/jds --report-dir /tmp/jds

# 4. Retrieve the reports (which files failed / which took the OCR path)
docker compose cp backend:/tmp/jds/failed_files.csv . 2>/dev/null || true
docker compose cp backend:/tmp/jds/ocr_files.csv .    2>/dev/null || true

# 5. Spot-check retrieval quality
docker compose exec -e EMBEDDING_ENABLED=true backend \
  python scripts/query_knowledge.py "senior backend engineer kafka" --top-k 5
```

Notes:

- `-e EMBEDDING_ENABLED=true` scopes embeddings to the ingestion command without
  flipping the flag for the whole app; to enable permanently, add
  `EMBEDDING_ENABLED=true` to `backend/.env` instead.
- On the production stack substitute `docker compose -f docker-compose.prod.yml`.
- Concurrency defaults (4 native / 2 OCR in flight) match the single-GPU Ollama
  setup; tune with `--concurrency` / `--ocr-concurrency` if hardware changes.
