# Master Prompt 3 — AI Orchestration, Evaluation, AI-Risk: Implementation Summary

Scope for this pass (per your decision): **backend only**. Frontend (admin
bank dashboard, candidate exam UI, report views, AI-risk display) is
explicitly deferred — see Known Limitations.

GLM client built against the **OpenAI-compatible chat-completions format**
(per your decision), configurable via env vars — works with Zhipu's
official API, OpenRouter, Together.ai, or a self-hosted vLLM endpoint
without code changes. Disabled by default; every GLM-routed task silently
falls back to the local Ollama model when unconfigured.

## 1. Summary of Architecture Changes

- **New AI orchestration layer**: `AiProviderService` (abstracts local
  Ollama vs. cloud GLM behind one `generate()`/`generate_with_correction()`
  interface, result-based error handling — never raises), `AiTaskRouterService`
  (pure routing table + deep-review escalation rules), `AiUsageService`
  (persists every call to `ai_usage_logs`).
- **Cost-control change**: CQ evaluation now happens **once per exam**
  (all 15 answers in one batched call) instead of once per section
  (3 separate calls, as Master Prompt 2 had it). MCQ grading is still
  immediate/synchronous. A second, optional GLM call only runs for
  candidates who trip a deep-review trigger (top scorer, borderline score,
  high AI-risk, or explicit admin request).
- **Question bank generation** now has two paths: local (existing
  many-small-batches loop from Master Prompt 2, unchanged) and GLM (one
  larger call per section, since a cloud "quality" model doesn't need the
  small-model workaround). Selected once per bank via the task router.
- **Automated quality review** runs immediately after generation (not
  gated behind a separate admin click): flags weak questions, attempts one
  combined repair call per section, deactivates anything that can't be
  repaired. The existing human "approve" step is unchanged and now informed
  by this review's `quality_score`.
- **Scoring formula made explicit**: within each section, MCQ now
  explicitly counts for 40% and CQ for 60% (configurable), rather than
  whatever ratio the raw mark totals happened to produce.
- **AI-risk extended**: 2 new behavioral signals (paste length, time-per-
  question), a low/medium/high risk bucket, a `warning` string, and an
  optional hedged GLM explanation for deep-review-triggered candidates only.

## 2. Files Modified

**New:**
- `backend/alembic/versions/c4a7e21f9b6d_add_ai_orchestration_usage_logs.py`
- `backend/app/db/models/ai_usage.py` (`AiUsageLog`)
- `backend/app/services/ai_provider_service.py`
- `backend/app/services/ai_task_router_service.py`
- `backend/app/services/ai_usage_service.py`
- `backend/app/services/cq_batch_evaluation_service.py`
- `backend/app/schemas/ai_orchestration.py`
- `backend/app/prompts/glm_tasks.py`
- `backend/tests/test_ai_orchestration.py`
- `docs/ai-orchestration-implementation-summary.md` (this file)

**Modified (all additive):**
- `app/config.py` — GLM settings, deep-review thresholds, MCQ/CQ section weights.
- `app/db/models/test.py` — `Question.skill_tags_json` (additive; `skill_tested` untouched).
- `app/db/models/__init__.py` — registers `AiUsageLog`.
- `app/services/test_generation_service.py` — `TestType.PRACTICAL` added to `_TEST_TYPE_CONFIG`/`_duration_for_type` (was missing).
- `app/services/question_bank_service.py` — GLM generation path (`_generate_section_glm`), automated review (`run_automated_quality_review`, `_attempt_repair`), provider resolved once per bank.
- `app/services/evaluation_service.py` — `filter_to_locked_questions()` factored out (shared with the batched evaluator); `score_mcqs`/`score_to_recommendation` public aliases.
- `app/services/scoring_service.py` — explicit MCQ/CQ within-section blend.
- `app/services/ai_risk_service.py` — new signals, `_risk_level()`, `get_risk_summary()`, `get_risk_explanation()`.
- `app/services/exam_attempt_service.py` — evaluation now enqueued once (at final section submit), not per-section.
- `app/worker.py` — new `task_evaluate_exam_batched`; old `task_evaluate_section_attempt` kept registered but no longer auto-triggered (superseded, not deleted).
- `app/api/v1/exam_reports.py` — retry-evaluation endpoint; report endpoint now uses `ai_risk_service`.
- `app/schemas/exam.py` — `ai_likeness_risk`, `ai_risk_reasons`, `ai_risk_explanation` fields.
- `app/api/v1/router.py` — no new routers needed (extended existing ones).

## 3. New Environment Variables

```
QUESTION_BANK_MODE=false          # from Master Prompt 2, unchanged
GLM_ENABLED=false
GLM_API_BASE_URL=                 # e.g. https://api.z.ai/v1, https://openrouter.ai/api/v1, or a self-hosted vLLM URL
GLM_API_KEY=
GLM_MODEL=glm-4-plus
GLM_TIMEOUT_SECONDS=120
GLM_MAX_RETRIES=2
DEEP_REVIEW_TOP_CANDIDATE_THRESHOLD=85.0
DEEP_REVIEW_BORDERLINE_WINDOW=10.0
DEEP_REVIEW_AI_RISK_THRESHOLD=70.0
SECTION_MCQ_WEIGHT=0.40
SECTION_CQ_WEIGHT=0.60
```
All have safe defaults; leaving the GLM_* block empty means every GLM-routed
task transparently runs on the local model instead.

## 4. New Database Tables / Migrations

One additive migration: `c4a7e21f9b6d_add_ai_orchestration_usage_logs.py`
- New table: `ai_usage_logs` (task_type, provider, model, jd_id, candidate_id, exam_attempt_id, token counts, latency_ms, success, error_message).
- New column: `questions.skill_tags_json` (additive; existing `skill_tested` column and every reader of it are untouched).

## 5. New AI Services

| Service | Responsibility |
|---|---|
| `ai_provider_service.py` | `generate()`/`generate_with_correction()` — local Ollama or GLM (OpenAI-compatible), retries, JSON validation, usage logging, never leaks the API key |
| `ai_task_router_service.py` | Pure task→provider routing table + deep-review escalation (`should_deep_review`, `classify_score`) |
| `ai_usage_service.py` | Persists/reads `ai_usage_logs` |
| `cq_batch_evaluation_service.py` | The one-call-for-15-answers CQ evaluator, with optional GLM deep-review pass |

## 6. New Prompts/Templates

`app/prompts/glm_tasks.py` — task-level templates (not model-family templates like `gemma.py`/`qwen.py`, since the same wording goes to whichever provider is resolved): bank-section generation, question quality review, batched CQ evaluation, AI-risk explanation. Validated against new strict schemas in `app/schemas/ai_orchestration.py`.

## 7. New Queue/Evaluation Behavior

- Evaluation is enqueued **once**, when the candidate submits the **final**
  section (not per-section as before) — `task_evaluate_exam_batched` (ARQ,
  reusing the existing Redis-backed queue from Master Prompt 2; no BullMQ/
  NestJS introduced, since this is a Python/FastAPI backend).
- On any failure, the exam is marked `FAILED` — candidate answers and any
  already-graded MCQ scores are never touched. Admin retry:
  `POST /api/v1/exam-admin/attempts/{id}/retry-evaluation` (only valid from `FAILED`).

## 8. How to Run Locally

```bash
cd backend
alembic upgrade head
# optionally:
export GLM_ENABLED=true GLM_API_BASE_URL=... GLM_API_KEY=...
```
Without GLM credentials, everything (bank generation, review, CQ evaluation) runs on the existing local Ollama model exactly as before.

## 9. How to Test

```bash
cd backend
./.venv_test/bin/python -m pytest tests -q                          # full suite: 333/333 passing
./.venv_test/bin/python -m pytest tests/test_ai_orchestration.py -q # 22 new tests for this prompt
./.venv_test/bin/python -m ruff check app/ tests/
```
**Not done in this pass** (flagging honestly per the prompt's own "Implementation Safety" checklist): no live run against a real Postgres/Redis/Ollama via `docker-compose up`, and no real GLM endpoint was exercised — everything above was validated against the existing SQLite/mocked-Ollama pytest harness, the same level of verification Master Prompt 2 used. Before going further, run `alembic upgrade head` against a real dev Postgres and smoke-test the admin → candidate → evaluation flow end-to-end.

## 10. Remaining Risks

- **Frontend is still not wired up** — same gap flagged after Master Prompt 2, now larger (bank status, AI-risk display, report views all need UI).
- **No real GLM endpoint has been exercised** — the OpenAI-compatible client is implemented and unit-tested with mocks, but its actual behavior against a real Zhipu/OpenRouter/Together/self-hosted response has not been verified.
- **`task_evaluate_section_attempt` is now dead code** (superseded, kept per the additive-change policy) — low risk, but worth removing once the new flow is proven, to avoid two evaluation paths confusing future readers.
- **Quality-review repair is best-effort, single-attempt** — a flagged question that fails repair stays permanently inactive until the bank is regenerated; there's no automatic "generate one replacement question" flow yet (the prompt explicitly allowed this as a fallback, so this is accepted, not silently dropped).
- **Deep-review GLM pass re-sends all 15 answers**, not just the borderline ones — simpler and still far cheaper than 15 separate calls, but slightly more than strictly minimal for a candidate who only trips one signal.

## 11. TODOs

- Add `/api/v1/candidate-exams/*` to the Next.js candidate proxy allowlist (still blocking any frontend work).
- Build the admin bank-management UI (generate/review/regenerate, per-section counts, quality_score, below-recommended warnings).
- Build the candidate 3-section exam UI + status screens ("Submission received" / "Evaluation in progress" / "Completed").
- Build the report view, including the AI-risk display with the mandated warning language.
- Exercise the GLM client against a real endpoint once credentials are available; confirm the OpenAI-compatible assumption holds for whichever provider is actually used.
- Run a real `docker-compose up` smoke test (admin flow, candidate flow, evaluation flow) before calling this production-ready.

## 12. Suggested Next Cleanup/Refactor

1. Frontend wiring (the natural next prompt, same recommendation as after Master Prompt 2 — now covering both the question-bank UI and the AI-risk/report UI).
2. Once the new batched-evaluation flow has run in production without issues, remove `task_evaluate_section_attempt` and the now-unused per-section evaluation trigger path entirely.
3. Multi-tenancy (`companies`) — still explicitly deferred from Phase 1, unaffected by this prompt.
