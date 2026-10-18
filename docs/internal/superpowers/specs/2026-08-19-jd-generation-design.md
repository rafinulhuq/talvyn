# Self-hosted JD Generation — Design

**Date:** 2026-08-19 · **Status:** proposed

## Goal

Let an operator generate a job description *inside the app* from a short brief
(title, role, seniority, skills, …) instead of only uploading one. The
generated JD is reviewed/edited, then flows through the **existing** pipeline
unchanged: skill extraction → test generation → candidate invitations.

Runs entirely on the app's self-hosted Ollama stack — no external LLM.

## What already exists vs. what's new

The pipeline is mostly built. JD generation is a new *front* onto it.

| Step | Status | Where |
|---|---|---|
| Brief → **generate JD text** | 🆕 new | this design |
| **Edit/review JD text** | 🆕 new (no edit endpoint today) | this design |
| JD text → skills (`analyze`) | ✅ exists | `task_extract_skills` → `JdExtractedData` |
| skills → tests/questions | ✅ exists | `task_generate_tests` / `task_generate_bank` |
| tests → candidates | ✅ exists | `invitation_service` |

Everything downstream keys off `JobDescription.raw_text` + `JdExtractedData`, so
the new work only has to produce a good `raw_text` and let a human edit it.

## The flow

```
POST /api/v1/jd/generate {title, seniority, skills, …}
  → create JobDescription(source=GENERATED, generation_status=DRAFTING)
  → enqueue task_generate_jd(jd_id, brief)         [202 + jd_id]
task_generate_jd:
  → ai_provider_service.generate(JD_GENERATION, schema=JobDescriptionAI)
  → assemble validated JSON into raw_text
  → jd.raw_text set · parse_status=DONE · generation_status=IDLE
     (on failure: generation_status=FAILED, generation_error)
frontend polls GET /jd/{id}/status
  → redirect to the JD detail page (EDITABLE)
operator reviews / edits raw_text  → PATCH /api/v1/jd/{id}/text
  → clicks Analyze (existing) → Generate Tests (existing) → Invite (existing)
```

Human-in-the-loop is preserved at three existing gates: the editable JD, the
approve-tests step, and the explicit invite step. **No auto-send** — a generated
JD never reaches a candidate without a person approving the tests.

## Why async (ARQ), not synchronous

JD generation is a single Ollama call, but on the low-VRAM/CPU hardware profiles
(gemma3:1b/4b) that can be 15–40 s — past the Next.js proxy's 30 s default
timeout. Every other AI job in the app (`task_extract_skills`,
`task_generate_tests`, `task_generate_bank`) is an ARQ job with 202 + status
polling. Mirroring that pattern is the consistent, robust choice: reuses
`generation_status`, the `/jd/{id}/status` poll, and the existing SSE progress
plumbing; survives worker restarts; and never holds an HTTP request open.

The JD record is created *first* (empty, `DRAFTING`) so the client has an id to
poll and so a failed generation is still a visible, retryable row.

## Data model changes (Alembic owns; mirror in Prisma — see schema-authority.md)

`JobDescription` is currently modeled for uploads (`file_path`, `file_type` are
NOT NULL). A generated JD has no file. Migration:

- `source`: new enum `JdSource { UPLOADED, GENERATED }`, default `UPLOADED` for
  backfill. Discriminates origin cleanly.
- `file_path`, `file_type` → **nullable** (a generated JD has neither).
- `generation_input_json`: JSONB — the brief the operator submitted (title,
  seniority, skills, tone, …). Enables "regenerate" and provides provenance.
- `GenerationStatus`: add `DRAFTING` (JD text being generated) so it never
  collides with `GENERATING` (test generation).

A generated JD sets `raw_text` directly and `parse_status = DONE` — it skips the
parse step entirely (there's no file to parse).

## Backend pieces

1. **Prompt + schema** (`app/prompts/*.py`, `app/schemas/…`):
   - `JD_GENERATION` template (per model: gemma/qwen/glm), following the existing
     validate → correction-retry pattern.
   - `JobDescriptionAI` Pydantic schema: `{ title, seniority, summary,
     responsibilities: list[str], requirements: list[str],
     nice_to_haves: list[str], tools: list[str] }` with length/bounds validators.
   - The operator's brief is interpolated as **fenced, untrusted input**
     (audit lesson) even though the author is a trusted admin.
2. **Service** `jd_generation_service.generate_jd(brief) -> JobDescriptionAI`
   via `ai_provider_service.generate(expected_json_schema=JobDescriptionAI)`, then
   `render_raw_text(ai)` → a clean Markdown/plain JD used as `raw_text`.
3. **Worker task** `task_generate_jd(ctx, jd_id)` — loads the JD + its
   `generation_input_json`, calls the service, writes `raw_text`, flips statuses.
   Registered in `WorkerSettings.functions`.
4. **Endpoints** (`app/api/v1/jd.py`):
   - `POST /jd/generate` — `CurrentActor` + `X-Uploader-Id`, `@limiter.limit`,
     creates the JD row and enqueues the task; returns 202 + jd_id. Mirrors
     `analyze_jd`.
   - `PATCH /jd/{id}/text` — owner-scoped, rate-limited; updates `raw_text`
     (clears/keeps `parse_status=DONE`). Backs the review-edit step. Also useful
     for uploaded JDs.
5. **Schemas** (`app/schemas/jd.py`): `GenerateJdRequest`, `UpdateJdTextRequest`.

## Frontend pieces

- **`JdGenerateForm.tsx`** — mirrors `JdUploadForm.tsx`. Fields: title\*, role /
  department, seniority (select), must-have skills (tag input), nice-to-have
  skills, tools/tech, years of experience, company/context, tone. A tab or
  toggle on the JD page switches Upload ⇄ Generate.
- **`/api/jd/generate` route** — mirrors `/api/jd/upload/route.ts` (session check
  + `X-Uploader-Id` + internal token). Status polling reuses the existing JD
  status hook.
- **Editable JD** — a textarea + Save on the JD detail page calling
  `PATCH /jd/{id}/text`, gated to `DRAFTING`-origin or any owner.
- After generation completes, land on the JD detail page in review state, then
  the normal Analyze / Generate / Invite buttons take over.

## Security / limits

- Owner-scoped (`CurrentActor` + `owner_scope_for`) exactly like the rest of the
  JD routes; rate-limited (`5/minute`, matching `analyze`).
- Brief is admin-authored but still fenced in the prompt; the model output is
  schema-validated before any DB write (no unbounded text into `raw_text`).
- `generation_input_json` and `raw_text` are workspace data — same scoping as
  every other JD field.

## Phased build plan

1. **Migration + models** — `source`, nullable file fields,
   `generation_input_json`, `DRAFTING`; SQLAlchemy + Prisma mirror.
2. **Prompt + schema + service** — `JD_GENERATION`, `JobDescriptionAI`,
   `jd_generation_service`, unit tests for schema bounds + `render_raw_text`.
3. **Worker task + endpoints** — `task_generate_jd`, `POST /jd/generate`,
   `PATCH /jd/{id}/text`; wire status.
4. **Frontend** — `JdGenerateForm`, `/api/jd/generate`, edit-text UI, Upload⇄
   Generate toggle.
5. **Polish** — "Regenerate" (reuse `generation_input_json`), empty/error states,
   tests.

## Open questions

- **Model choice**: use the hardware-selected `OLLAMA_MODEL`, or a fixed small
  model for JD text (it's simpler than test generation)? Default: reuse the
  selected model.
- **Structured pre-fill**: the generation JSON already contains title/seniority/
  skills — optionally pre-seed `JdExtractedData` to skip the `analyze` step. For
  v1, keep `analyze` as the single canonical path (simpler, uniform); revisit as
  an optimization.
- **Regenerate vs. edit**: both supported (regenerate from the brief, or hand-
  edit the text). Fine to ship edit first, regenerate in phase 5.
