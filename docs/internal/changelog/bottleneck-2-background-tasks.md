# Bottleneck 2 — Background Tasks for AI Pipeline

**Date:** 2026-05-24
**Branch:** office
**Status:** ✅ Done

---

## Problem

Two expensive AI operations were **blocking HTTP requests** — the client had to keep
the connection open for the full duration:

| Endpoint | Was | Wait time |
|---|---|---|
| `POST /jd/{id}/analyze` | Blocking — waited for Ollama skill extraction | ~60–120 seconds |
| `POST /tests/generate/{id}` | Blocking — waited for all 3 test generations | ~4–6 min (after Fix 1) |

No real-world app makes users stare at a loading spinner for 6 minutes with an open
HTTP connection. If the connection dropped, the entire job was lost.

---

## Fix Overview

Return **202 Accepted immediately**. Run the expensive Ollama work in the background.
The frontend polls a single status endpoint to know when each stage is done.

```
Before:  POST /analyze  ──────────────────────────────► 200 (60s later)
After:   POST /analyze  ──► 202 (instant)
          poll /status  ──► { generation_status: "EXTRACTING" }
          poll /status  ──► { generation_status: "IDLE" }  ✓ done
```

---

## New Status Model

Added a `generation_status` field to track the full AI pipeline state.

### States

```
IDLE        → Nothing running, awaiting next action
EXTRACTING  → Skill extraction in progress (POST /analyze was called)
GENERATING  → Test generation in progress (POST /generate was called)
READY       → 3 tests generated and ready
FAILED      → Last background operation failed (check server logs)
```

### Transitions

```
Upload JD
  └─► parse_status: PENDING → PROCESSING → DONE
                              (text extraction, was already backgrounded)

POST /analyze
  └─► generation_status: IDLE → EXTRACTING → IDLE   (success)
                                            → FAILED (error)

POST /generate
  └─► generation_status: IDLE → GENERATING → READY  (success)
                                           → FAILED  (error)
```

---

## Files Changed

### 1. `backend/app/db/models/enums.py`
Added `GenerationStatus` enum with 5 values: `IDLE`, `EXTRACTING`, `GENERATING`, `READY`, `FAILED`.

### 2. `backend/app/db/models/job_description.py`
Added `generation_status` column to the `JobDescription` model.
- Stored as `VARCHAR(20)` via `native_enum=False` — no PostgreSQL enum type needed.
- Default value: `IDLE`.

### 3. `backend/app/main.py`
Added an **idempotent startup migration** in the lifespan hook:
```sql
ALTER TABLE job_descriptions
ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) NOT NULL DEFAULT 'IDLE'
```
Runs on every startup. `IF NOT EXISTS` makes it a no-op once the column is present.
No Alembic required — safe for the current dev setup.

### 4. `backend/app/schemas/jd.py`
- `JdParseStatusResponse` — extended with `generation_status` and `has_tests`.
- `AsyncJobAcceptedResponse` — new schema for the 202 response body.
- `JobDescriptionResponse` + `JobDescriptionListItem` — both now include `generation_status`.

### 5. `backend/app/services/jd_service.py`

Added two new background functions:

**`extract_skills_background(jd_id)`**
- Opens its own `AsyncSessionFactory` session (never shares with the HTTP request).
- Sets `generation_status = EXTRACTING`, runs Ollama extraction, sets `IDLE` on success.
- Sets `FAILED` on any exception.

**`generate_tests_background(jd_id)`**
- Opens its own `AsyncSessionFactory` session.
- Validates extracted skills exist, sets `generation_status = GENERATING`.
- Calls `generate_tests_for_jd()` (which already uses `asyncio.gather` from Fix 1).
- Sets `READY` on success, `FAILED` on any exception.

Updated `get_jd_status()`:
- Now returns `generation_status` and `has_tests` in addition to `parse_status`.
- `has_tests` is a lightweight count query (no full row fetch).

### 6. `backend/app/api/v1/jd.py`
`POST /{jd_id}/analyze`:
- **Before:** blocking 200, caught `AIServiceError`/`AIResponseParseError` inline.
- **After:** validates pre-conditions (fast, no Ollama), fires `extract_skills_background`
  via `BackgroundTasks`, returns **202** with `AsyncJobAcceptedResponse`.

### 7. `backend/app/api/v1/tests.py`
`POST /generate/{jd_id}`:
- **Before:** blocking 201, waited 4–6 min for all 3 tests.
- **After:** validates pre-conditions, fires `generate_tests_background` via `BackgroundTasks`,
  returns **202** with `AsyncJobAcceptedResponse`.
- Guard: if `generation_status` is already `GENERATING`, returns 202 without re-queuing.

---

## New Frontend Polling Flow

```
1. POST /api/v1/jd/upload
   ← 201 { parse_status: "PENDING", generation_status: "IDLE" }

   poll GET /api/v1/jd/{id}/status every 3s
   ← { parse_status: "PROCESSING", generation_status: "IDLE" }
   ← { parse_status: "DONE",       generation_status: "IDLE" }  ✓ text ready

2. POST /api/v1/jd/{id}/analyze
   ← 202 { generation_status: "EXTRACTING", message: "..." }

   poll GET /api/v1/jd/{id}/status every 3s
   ← { generation_status: "EXTRACTING" }
   ← { generation_status: "IDLE", has_extracted_data: true }    ✓ skills ready

3. POST /api/v1/tests/generate/{id}
   ← 202 { generation_status: "GENERATING", message: "..." }

   poll GET /api/v1/jd/{id}/status every 3s
   ← { generation_status: "GENERATING" }
   ← { generation_status: "READY", has_tests: true }            ✓ tests ready
```

If `generation_status == "FAILED"` at any point, show an error and offer a retry button.

---

## Result

| | Before | After |
|---|---|---|
| `/analyze` response time | ~60–120s | < 100ms |
| `/generate` response time | ~4–6 min | < 100ms |
| Connection kept open | Yes (risk of timeout/drop) | No |
| Progress visibility | None | Poll `/status` for live state |
| Failed job recovery | Lost on connection drop | Status shows FAILED, retry is safe |

---

## Files Changed Summary

```
backend/app/db/models/enums.py              — added GenerationStatus enum
backend/app/db/models/job_description.py    — added generation_status column
backend/app/main.py                         — idempotent startup DB migration
backend/app/schemas/jd.py                   — updated status schema + new 202 schema
backend/app/services/jd_service.py          — two new background task functions
backend/app/api/v1/jd.py                    — /analyze now returns 202
backend/app/api/v1/tests.py                 — /generate now returns 202
```
