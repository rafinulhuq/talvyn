# Talvyn AI/Assessment Architecture Redesign — Pre-Implementation Audit

**Scope:** This audit answers Master Prompt 1 (Senior Architecture Audit Before Redesign). It is scoped specifically to the question-bank / candidate-exam / AI-model-strategy redesign, not a general platform health audit. For dependency CVEs, RBAC hardening, CI/E2E gaps, and deployment/docs drift, see the existing `docs/system-audit-2026-06-21.md`, which remains current and is not duplicated here.

**Read-only audit. No code, schema, or config was changed while producing this document.**

---

## 0. Headline Finding

The codebase is **significantly further along** than Master Prompt 1 assumed. Specifically:

- A reusable question bank **already exists**: `Question` rows belong to `Test`, `Test` belongs to `JobDescription` — never to a candidate or attempt. All candidates assigned the same JD answer the same stored questions (MCQ options are shuffled per attempt for display only; the question set itself is never regenerated per candidate).
- The "AI-likeness, never a verdict" philosophy **is already implemented**, almost verbatim, in `ai_detection_service.py`.
- There is **no cloud LLM integration at all** today — every AI call goes to a local Ollama instance (`gemma3:4b` by default, with a `qwen` prompt-family alternative). The "GLM-5.2 Cloud" tier in the master prompt would be a net-new integration, not a swap.
- There is **zero multi-tenancy** — no `company_id`/tenant column anywhere, and the frontend's "Companies" page is an explicit placeholder ("Talvyn is currently single-tenant... multi-company support is on the roadmap but not built yet"). This is the single largest gap relative to the "~10 companies" commercial target.
- The frontend's Prisma schema and the backend's SQLAlchemy/Alembic schema **point at the same physical Postgres database** (`jd_assessment`), with Prisma's migration history (2 migrations) far behind Alembic's (13 migrations). Prisma is missing entire tables that already exist in that same database (webhooks, audit logs, public links, candidate numbering, AI-likeness columns). This is a live schema-ownership hazard, not a hypothetical one — already flagged independently in `docs/system-audit-2026-06-21.md`.

Everything below is grounded in file:line citations gathered directly from the repository.

---

## 1. Current Backend Architecture

**Framework:** FastAPI (async), SQLAlchemy 2.x ORM, Alembic migrations, Redis, ARQ for background jobs.

**Routers** (`backend/app/api/v1/`): `jd.py`, `tests.py`, `attempts.py`, `invitations.py`, `evaluation.py`, `admin.py`, `candidates.py`, `public_links.py`, `ai_checker.py`.

**Services** (`backend/app/services/`):

| Service | Responsibility |
|---|---|
| `jd_service.py` (662 ln) | JD upload, parsing orchestration, status tracking |
| `skill_extraction_service.py` (269 ln) | LLM-based JD → skills/seniority/topics extraction |
| `test_generation_service.py` (700 ln) | LLM-based generation of the 3 stored tests per JD |
| `test_service.py` (375 ln) | Fetch/update/approve/regenerate tests |
| `invitation_service.py` (791 ln) | Invitation lifecycle, token issuance/rotation/revocation |
| `attempt_service.py` (1079 ln) | Start/resume/autosave/submit candidate attempts |
| `evaluation_service.py` (1265 ln) | MCQ scoring, LLM open-ended/code scoring, aggregate recommendation |
| `ai_detection_service.py` | Opt-in, per-answer AI-likeness estimate (text-only signal) |
| `ai_checker_service.py` | Standalone admin document AI-checker tool (separate feature) |
| `ollama_service.py` | Ollama HTTP client: retries, timeouts, JSON extraction |
| `public_link_service.py` (519 ln) | Public self-registration links |
| Others | webhook dispatch, email, search/export, admin backup/restore |

**Auth flow:**
- **Admin/company users:** authenticate via NextAuth in the Next.js layer (not the backend). The backend trusts a shared-secret `X-Internal-Token` header on every admin-originated request (constant-time HMAC compare, `dependencies.py:18-48`), plus `X-Actor-Id`/`X-Uploader-Id`/`X-Inviter-Id` headers forwarded by the Next.js proxy for audit attribution. The backend itself never issues admin sessions.
- **Candidates:** magic-link token per invitation. Raw token is emailed once; only `HMAC-SHA256(raw_token)` is stored as `invitations.token_hash` (`core/security.py:30-66`). After validating the invitation, the candidate receives an `X-Attempt-Token` used for all subsequent attempt calls.

**Existing AI services:** Ollama only — no OpenAI/Anthropic/Gemini/GLM. Model selection is a single config string (`ollama_model`, default `gemma3:4b`); a `qwen` prompt-family exists and is selected by substring match on the model name (`prompts/registry.py`).

**Existing job/candidate/test/evaluation flow (current, verified end-to-end):**
1. Admin uploads JD → `task_parse_jd` (ARQ) extracts text.
2. Admin triggers analysis → `task_extract_skills` (ARQ, 1 Ollama call) → persists `JdExtractedData`.
3. Admin triggers test generation → `task_generate_tests` (ARQ) → 3 parallel/sequential Ollama calls (one per `TestType`: `TECHNICAL`, `REASONING`, `PROBLEM_SOLVING`) → persists `Test` + `Question` rows, `status=DRAFT`. **All-or-nothing**: any one test type failing after retries fails the whole batch, nothing partial is saved.
4. Admin approves tests → `status=APPROVED`.
5. Admin creates an invitation (per candidate × JD) → magic link emailed.
6. Candidate opens link → token validated → `invitations.status=OPENED`.
7. Candidate starts attempt → `attempt_service._load_approved_tests_for_jd_cached()` (`attempt_service.py:174-206`) reads the **already-stored** `APPROVED` tests/questions — **no LLM call here**. MCQ option order is shuffled per attempt for display; correct answers are stripped before the response leaves the backend.
8. Candidate autosaves answers, periodic heartbeat, then submits.
9. Admin triggers evaluation → **synchronous** call in the API handler (not background): MCQ scored deterministically; open-ended/code scored via Ollama (1 call each, parallelized via `asyncio.gather`); aggregate strengths/weaknesses/recommendation via one more Ollama call; optional AI-likeness estimate (1 more Ollama call per open-ended answer) if `ai_likeness_enabled=true` (default `false`).
10. Admin reviews/overrides in the evaluation inbox.

---

## 2. Current Frontend Architecture

**Framework:** Next.js (App Router) + NextAuth (JWT sessions, 8h) + Prisma + Redux is **not used** (plain React state/hooks throughout).

**Main pages:**
- `(auth)/login` — admin login (NextAuth credentials → Prisma `User` table).
- `(admin)/dashboard/*` — JDs, candidates, results, leaderboard, users, settings, templates, ai-checker, **companies** (placeholder, confirmed not built).
- `test/[token]/*` — candidate flow: landing → exam → complete/expired/terminated.
- `apply/[slug]` — public self-registration.

**API calls / proxy layers** (`frontend/src/app/api/`):
- `/api/proxy/[...path]` — authenticated admin proxy; requires NextAuth JWT, injects `X-Internal-Token` + actor headers, forwards to FastAPI. This is the path almost everything admin-side goes through.
- `/api/candidate/[...path]` — unauthenticated, allowlisted to `/api/v1/attempts/*`, injects `X-Internal-Token` + forwards candidate's `X-Attempt-Token`.
- `/api/public/[...path]` — unauthenticated, allowlisted to `/api/v1/public-links/*`.
- `/api/admin/users/*` and `lib/auth.ts` — the only routes that touch Prisma directly (admin account CRUD + credential check).

**State management:** No Redux Toolkit despite being a listed dependency in `node_modules` (not wired up). Plain `useState`/`useContext`; admin pages are mostly server-rendered with `revalidate=0`.

**Existing candidate exam UI** (`components/candidate/`): `MCQQuestion`, `OpenEndedQuestion`, `CodeQuestion`, `ProgressBar`, `TestTimer`, `SubmitConfirm`, `TestComplete`, `TestTerminated`.

**Existing admin/report UI** (`components/admin/`): JD upload/analyze/generate, `QuestionEditor`, `TestPreviewPanel`, invite forms (single + bulk CSV), user role/status management. Results/evaluation views live under `dashboard/results/[attemptId]`.

---

## 3. Current Database Model

**Source of truth in practice:** SQLAlchemy models under `backend/app/db/models/` + Alembic (`backend/alembic/versions/`, head `7f09e88b05e8`, 13 migrations, **zero destructive operations** in the whole history).

**Tables:** `users`, `job_descriptions`, `jd_extracted_data`, `tests`, `questions`, `candidates`, `candidate_number_counters`, `invitations`, `test_attempts`, `candidate_answers`, `suspicious_events`, `evaluations`, `question_feedback`, `public_assessment_links`, `admin_audit_logs`, `webhook_subscriptions`, `webhook_deliveries`.

**Question-bank shape (already matches the desired model structurally):**
```
JobDescription (1) ──< Test (3: TECHNICAL / REASONING / PROBLEM_SOLVING) ──< Question (N)
                                                                                  ↑
TestAttempt (1 per candidate × test) ──< CandidateAnswer ───────────────────────┘ (FK to shared Question, never duplicated)
```
`questions.test_id` is the only parent FK — questions are never copied per candidate. `test_mcq_count=5` and `test_oe_count=2` per test today (`config.py:93-94`) — well below the target 10 MCQ + 5 CQ per section.

**What can be reused as-is:** `JobDescription`, `Test`, `Question`, `Candidate`, `Invitation`, `TestAttempt`, `CandidateAnswer`, `Evaluation`, `QuestionFeedback`, `SuspiciousEvent`, the GUID/JSONType/VectorType portable column types (`_types.py`), the audit log and webhook tables.

**What needs additive changes:**
- `tests.test_type` — needs a 4th value or a remap (`REASONING` / `PRACTICAL` / `TECHNICAL`, currently `TECHNICAL`/`REASONING`/`PROBLEM_SOLVING` — `PROBLEM_SOLVING` and `PRACTICAL` are not the same label and the redesign should explicitly decide whether to rename or add).
- `test_mcq_count`/`test_oe_count` config needs to become per-section (10 MCQ + 5 CQ) rather than one global pair.
- `evaluations`/`question_feedback` already have AI-likeness columns (`overall_ai_likeness_percentage`, `estimated_ai_percentage`, confidence enums) but these are driven purely by **text-style** signal from one LLM call — there is no column today that stores a **composite** AI-risk score blending `suspicious_events` (timing, tab-switch, copy/paste) with the text signal. The master prompt's "AI-risk score = combination of behavioral + textual signals" needs a new aggregation, not just reuse of existing columns.
- No `company_id`/tenant column on any table.

**What's newly needed:**
- A `companies`/tenants table plus scoping FK on `users`, `job_descriptions`, `candidates` (or `invitations`), if the "10 companies" target is to be enforced at the data layer rather than convention.
- A composite AI-risk aggregation table or columns (combining `suspicious_events` counts/timing with the existing text-based AI-likeness estimate) if the master prompt's blended AI-risk score is to be persisted rather than computed ad hoc.
- Section-level structure if "3 sections × (10 MCQ + 5 CQ)" is to be modeled explicitly rather than inferred from `test_type` + count config (a `section_index`/`section_label` could be enough — does not require a new table).

---

## 4. Current AI Integration

**Model provider:** Ollama only, self-hosted, `gemma3:4b` default (`config.py:73-97`). No cloud provider, no API keys, no external network call for any AI feature today.

**Prompt structure:** `backend/app/prompts/{gemma,qwen,types,registry}.py`. One system prompt + template + correction-template triplet per task (skill extraction, test generation, open-ended eval, code eval, aggregate eval, AI-likeness). Model family selected by substring match on `ollama_model`.

**API call locations:** `skill_extraction_service.py`, `test_generation_service.py`, `evaluation_service.py` (3 call sites: open-ended, code, aggregate), `ai_detection_service.py` (2 call sites: per-answer, per-document), all routed through `ollama_service.py`'s persistent `httpx.AsyncClient`.

**Error handling / retry:** Built-in exponential backoff in `ollama_service.py`, plus a service-level "ask again with the validation error" correction loop (1–3 extra attempts depending on task) before raising `AIResponseParseError`/`AIServiceError`. `ai_detection_service.py` is the one exception: on any failure it **silently returns `None`** rather than raising, by design (AI-likeness is always optional, never blocks the pipeline).

**Cost risk today:** Low and already well-controlled — skill extraction and test generation are one-time-per-JD and cached as DB rows; only evaluation runs per-candidate (2–10 Ollama calls per attempt depending on open-ended question count and whether AI-likeness is enabled). Since Ollama is local/self-hosted, there is no metered API cost today — the entire master-prompt "control AI/API cost" concern only becomes real **once a paid cloud tier (GLM) is introduced**, which doesn't exist yet.

**Where AI is called unnecessarily:** Not observed — generation is cached, evaluation only runs once per submitted attempt (re-evaluation is an explicit override flow, not automatic), and AI-likeness is opt-in and per-answer (no document-level redundant calls found).

**AI-likeness / AI-risk language (the master prompt's core philosophy) — already implemented:** `ai_detection_service.py`'s module docstring states verbatim: *"PROBABILISTIC WRITING-STYLE SIGNAL, NEVER A VERDICT... must present the result as a review aid... never as proof of AI use or grounds for an automatic decision."* The system prompt in `prompts/gemma.py:375-386` reinforces: *"You will frequently be wrong in both directions... must never be presented as proof and must never be the sole basis for a hiring decision."* Output fields are `estimated_ai_percentage` / `confidence` (LOW/MEDIUM/HIGH) / `recommendation` (`NO_CONCERN`/`REVIEW_SUGGESTED`/`HIGH_CONCERN`) — no field or string anywhere claims certainty. **No work is needed here beyond combining this existing text signal with the existing-but-separate `suspicious_events` behavioral log into one blended score**, which is currently a gap, not a violation.

---

## 5. Current Risks

| Risk | Evidence | Severity |
|---|---|---|
| **Schema dual-ownership** — Prisma and SQLAlchemy/Alembic target the *same* Postgres database (`jd_assessment`, confirmed via `.env:POSTGRES_DB=jd_assessment` used by both backend and frontend `docker-compose.yml` service definitions), but Prisma's migration history (2 migrations) is missing entire tables Alembic already created (webhooks, audit logs, public links, candidate numbering, AI-likeness columns). Running `prisma migrate deploy` against this database would be destructive or would fail unpredictably. | Confirmed live, also flagged independently in `docs/system-audit-2026-06-21.md` ("Schema ownership: Still open") | **High** |
| **Synchronous evaluation** — `evaluation/trigger` blocks the request thread for the full duration of all LLM calls (5–30s today on local Ollama). Introducing a cloud GLM call with higher/variable latency on this same synchronous path risks request timeouts. | `evaluation_service.evaluate_attempt()` called directly from the API handler, not via ARQ | **Medium**, becomes **High** once cloud calls are added |
| **All-or-nothing test generation** — one test-type failing after retries discards the whole 3-test batch for that JD. Expanding to richer per-section counts increases the chance any single generation call fails validation. | `test_generation_service.py` design, confirmed by `test_test_generation.py` coverage of this behavior | Medium |
| **No multi-tenancy** — zero `company_id` anywhere; all admins see all data; "Companies" page is an explicit placeholder. Directly blocks the "~10 companies" commercial target as currently built. | `Companies` page source, grep for `company`/`tenant` across backend returned zero hits | **High** for the stated commercial goal |
| **No cloud AI integration exists** — adding GLM means a new provider abstraction, new API key handling, new retry/timeout/cost-tracking surface that doesn't exist today (current retry/timeout logic is Ollama-specific in `ollama_service.py`). | `ollama_service.py` is the only AI client; no provider interface to plug a second backend into | Medium — net-new work, not a risk to existing behavior, but a real scope item |
| **Broad admin authorization** — backend trusts a single shared `X-Internal-Token` for all admin actions rather than per-resource/per-role checks. Matters more once a company boundary is introduced (an admin from Company A could otherwise act on Company B's data). | `dependencies.py`, also flagged in `docs/system-audit-2026-06-21.md` | Medium, compounds with multi-tenancy gap |
| **Candidate submission loss risk** — low. Autosave on every answer + periodic heartbeat + unique `(invitation_id, test_id)` constraint to prevent double-start; `time_remaining_seconds` persisted server-side. No evidence of submission loss in the current design. | `attempt.py` indices, `attempt_service.py` autosave path | Low |
| **Migration risk for this redesign specifically** — low, since Alembic history is 100% additive so far; the main risk is the team's habit of adding new columns rather than new tables for related-but-distinct concepts (e.g. AI-likeness fields were added directly to `evaluations`/`question_feedback` rather than a separate table) — fine so far, but worth deciding deliberately for the new composite AI-risk score. | Migration chronology (section 3) | Low |

---

## 6. Proposed Redesign Map

**Stays as-is:**
- Question-bank-per-JD pattern (`Test`/`Question` keyed by JD, not candidate) — already correct.
- Auth flows (NextAuth admin sessions, magic-link candidate tokens) — no change needed.
- Evaluation pipeline shape (MCQ deterministic scoring, LLM-scored open-ended/code, aggregate recommendation) — extend, don't replace.
- `SuspiciousEvent` behavioral logging — already captures tab-switch/copy-paste/focus-loss; reuse as one input to the new composite AI-risk score.
- ARQ/Redis background-job infrastructure — reuse for any new long-running AI orchestration.
- Append-only audit log and webhook system.

**Modified (additive):**
- `tests.test_type` and the per-test question counts, to land on 3 sections × (10 MCQ + 5 CQ) — needs an explicit decision on whether `PROBLEM_SOLVING` becomes `PRACTICAL` (rename via a new enum value + dual-read period) or a 4th type is added.
- `evaluation_service.py` — extended to call the new orchestration layer (local model for routine scoring, optional cloud model for borderline/flagged cases) instead of being hardcoded to Ollama.
- `evaluation/trigger` — moved off the synchronous request path onto ARQ, consistent with how generation already works, once cloud calls (with less predictable latency) enter the picture.

**Newly added:**
- A provider-agnostic AI orchestration service (thin interface over "local model" vs "cloud model") so Ollama and a future GLM client are both call-sites behind one interface — this is the natural seam for the master prompt's tiered model strategy.
- A composite AI-risk aggregation step/table that combines `suspicious_events` behavioral signals with the existing text-based AI-likeness estimate into one score, still surfaced with the same hedged language already used today.
- `companies` table + scoping, if/when multi-tenancy is actually prioritized (see Risk Register — this is the largest single piece of net-new work in the whole redesign and deserves its own decision rather than being bundled silently into the question-bank work).

**Deprecated but not removed:**
- Frontend Prisma models for `Test`/`Question`/`Candidate`/`Invitation`/`TestAttempt`/`CandidateAnswer`/`Evaluation`/`SuspiciousEvent` — these are stale duplicates of tables Prisma never actually reads or writes (confirmed: only `User` is touched via Prisma). Recommend marking them clearly as unused/do-not-migrate in a comment and excluding them from any future `prisma migrate` run, rather than deleting them outright in this pass (deletion is out of scope per the master prompt's "do not delete code" rule, and doing so safely requires its own short, isolated change).

---

## 7. Safe Implementation Sequence

1. **Phase 1 — Database additive changes.** New Alembic migration(s) only: per-section question counts/labels, composite AI-risk columns or table, `companies` table + nullable scoping FKs (nullable so existing rows remain valid without backfill). No drops, no renames without a parallel dual-read column.
2. **Phase 2 — Backend services.** Extend `test_generation_service.py` for section-aware generation (10 MCQ + 5 CQ × 3); extend `attempt_service.py`'s question-assignment to lock the section-aware set per attempt (already locks per attempt today — extend, don't rebuild).
3. **Phase 3 — AI orchestration service.** New module behind an interface; Ollama becomes the "local" implementation; GLM (or chosen cloud provider) becomes the "cloud" implementation, gated by explicit per-call routing rules from the master prompt (local for extraction/mapping/basic eval, cloud for bank generation/rubrics/borderline review).
4. **Phase 4 — Candidate exam assignment.** Confirm/extend the existing lock-on-start behavior for the new section structure; no behavioral change to the locking mechanism itself.
5. **Phase 5 — Evaluation pipeline.** Move `evaluation/trigger` to ARQ; wire in the composite AI-risk aggregation; keep MCQ deterministic scoring untouched.
6. **Phase 6 — Frontend updates.** Section-aware exam UI (3 sequential sections instead of N tests, if that distinction matters to candidates); admin UI for reviewing the blended AI-risk score with the same hedged language already used.
7. **Phase 7 — Tests and QA.** Extend the existing comprehensive AI-service test suites (`test_test_generation.py`, `test_evaluation.py`, `test_ai_detection.py`) for the new section counts and the new orchestration interface; add tests for the composite AI-risk aggregation specifically, since it's wholly new logic.

This sequence matches the master prompt's requested phases; the only material change is folding the master prompt's "Phase 1 DB" instruction into a decision about whether multi-tenancy ships in this pass or as a separately-scoped follow-up (recommended: separately — see Risk Register).

---

## 8. Rollback Plan

- **Migrations:** every migration in this redesign should add nullable columns/new tables only, matching the existing project convention (13/13 prior migrations were additive). Rollback = `alembic downgrade` to the prior revision; no data loss because nothing existing is altered in place.
- **Feature flags:** the codebase already has the pattern for this (`ai_likeness_enabled`, `embedding_enabled` — both boolean config flags, default off). Reuse it: add `cloud_ai_enabled` (or similar) defaulting to `false`, and a `section_based_tests_enabled` flag if the section restructuring needs to roll out gradually per-JD rather than globally.
- **Compatibility wrappers:** if `test_type` gains a 4th value or a renamed value, keep the old value(s) readable indefinitely (additive enum value, not a rename) so any in-flight `DRAFT` tests or historical `Test` rows referencing the old type remain valid without a backfill migration.
- **Keeping old behavior available:** the synchronous evaluation path can stay as a fallback (e.g., behind a flag) until the ARQ-based path is verified in production, rather than cutting over in one step.

---

## Current System Summary

A FastAPI + Next.js assessment platform with a working, reused-question-bank model already in place: tests/questions are generated once per job description (via local Ollama) and reused unmodified across every candidate invited to that JD. Candidate identity and exam flow run through hashed magic-link tokens; admin identity runs through NextAuth + a Prisma-backed `User` table that lives in the *same* Postgres database as the backend's SQLAlchemy schema. AI-likeness detection is opt-in, per-answer, and already uses careful non-certain language. The system is single-tenant with no company/tenant concept, and all AI today is local/free (Ollama) — there is no cloud LLM spend to control yet.

## Target System Summary

Per Master Prompt 1: 3 sequential exam sections (Reasoning, Practical, Technical) of 10 MCQ + 5 CQ each, assigned from a per-JD reusable question bank and locked to the candidate's attempt; evaluation and generation split across a local model (cheap, repeated tasks) and an optional cloud model (quality-sensitive or borderline-review tasks); a blended AI-risk score combining behavioral signals (timing, tab-switch, copy/paste — already collected) with textual signals (already collected, separately) into one hedged, non-certain score; and, separately, a multi-tenant company boundary to actually support "~10 companies" as isolated customers rather than a shared single workspace.

## Migration Strategy

Strictly additive Alembic migrations only (continuing the project's 13-for-13 track record): new nullable columns/tables for section structure, composite AI-risk score, and company scoping. No renames without a parallel old-value-still-valid period. No change to the Prisma schema as part of this work — it should be explicitly marked deprecated/unused for data tables and left alone, since it shares the live database and any naive `prisma migrate` run against it is the single most dangerous available action in this codebase today.

## Exact Implementation Checklist

- [ ] Decide and document: does multi-tenancy ship in this redesign pass, or is it explicitly deferred? (Recommend: defer to its own scoped plan — it touches `users`, `job_descriptions`, `candidates`/`invitations`, and authorization simultaneously, and conflating it with the question-bank work multiplies review surface.)
- [ ] New migration: section label/index + per-section MCQ/CQ target counts (replace global `test_mcq_count`/`test_oe_count` with per-section config or columns).
- [ ] Decide: rename `PROBLEM_SOLVING` → `PRACTICAL` (additive enum value, dual-read) or introduce a 4th `TestType`.
- [ ] New migration: composite AI-risk columns/table joining `suspicious_events` aggregates with existing `overall_ai_likeness_percentage`/`estimated_ai_percentage`.
- [ ] New module: AI provider interface (`local` vs `cloud`) behind which `ollama_service.py` becomes one implementation and a new GLM (or chosen provider) client becomes the second.
- [ ] Extend `test_generation_service.py` for section-aware generation; keep all-or-nothing-per-batch semantics or revisit deliberately (it currently discards a whole JD's generation on one failure — confirm this is still acceptable at 30 MCQ + 15 CQ scale, since more calls means more chances for one to fail).
- [ ] Move `evaluation/trigger` from synchronous to ARQ-backed, behind a flag, before any cloud model is wired into that path.
- [ ] Implement the composite AI-risk scoring function; reuse the existing hedged-language conventions verbatim (do not introduce new certainty-implying strings).
- [ ] Mark Prisma's non-`User` models in `frontend/prisma/schema.prisma` as unused/do-not-migrate (comment, not deletion) and confirm no script anywhere runs `prisma migrate deploy`/`db push` against tables Alembic owns.
- [ ] Extend existing test suites (`test_test_generation.py`, `test_evaluation.py`, `test_ai_detection.py`) for new counts/orchestration; add new tests for the composite AI-risk function specifically.
- [ ] Frontend: section-aware exam UI; admin AI-risk review UI reusing existing hedged copy patterns from the AI-likeness work.

## Risk Register

| # | Risk | Owner action needed |
|---|---|---|
| 1 | Prisma/Alembic dual schema ownership on the same live database | Freeze Prisma to `User`-only usage explicitly; never run `prisma migrate deploy`/`db push` against this database |
| 2 | Multi-tenancy absent, but commercial target assumes ~10 isolated companies | Explicit go/no-go decision before folding into this redesign |
| 3 | Synchronous evaluation path + future higher-latency cloud calls | Move to ARQ before wiring in any cloud model |
| 4 | All-or-nothing generation at larger question counts | Decide whether partial-save-per-section is needed once volume triples |
| 5 | No existing provider abstraction for a second AI backend | Net-new scope item, size separately from the question-bank work |
| 6 | Broad shared-secret admin auth, compounds with future tenancy | Track as a prerequisite if/when multi-tenancy ships |

## Recommended Next Prompt to Run for Implementation

Suggest splitting Master Prompt 2 into two independent, sequential implementation prompts rather than one combined prompt:
1. **"Implement the section-aware question bank + AI orchestration layer (local + optional cloud), without multi-tenancy."** This is the prompt that should follow immediately — it's additive, scoped, and matches the existing architecture closely.
2. **"Add multi-tenant company scoping to Talvyn."** This should be its own later prompt, explicitly informed by the go/no-go decision above, since it cuts across auth, every major table, and admin authorization at once.
