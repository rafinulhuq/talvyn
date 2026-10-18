# Master Prompt 2 — Question Bank / Sectioned Exam: Implementation Summary

Implements a reusable, per-JD question bank and a 3-section candidate exam
(Reasoning / Practical / Technical, 10 MCQ + 5 CQ each = 30 MCQ + 15 CQ per
candidate) on top of the existing Talvyn backend, additively. Gated
behind `QUESTION_BANK_MODE` (default `false`) — with the flag off, every
existing route and the legacy single-test-per-JD flow behave exactly as
they did before this change (confirmed: all 297 pre-existing tests still
pass unmodified).

Decisions made per the Phase-1 audit and the user's confirmed choices:
multi-tenancy/companies skipped entirely; the per-section legacy
`TestAttempt` model is kept and wrapped by a new `ExamAttempt`, not
replaced; existing `tests`/`questions`/`evaluations`/`candidate_answers`
tables are extended in place rather than forked under new names.

## 1. Files Changed

**New files:**
- `backend/alembic/versions/b8d3f0c91a7e_add_question_bank_exam_architecture.py`
- `backend/app/db/models/question_bank.py` (QuestionBank, ExamTemplate, ExamAttempt, ExamAttemptQuestion, AiRiskSignal, CandidateReport)
- `backend/app/services/question_bank_service.py`
- `backend/app/services/exam_assignment_service.py`
- `backend/app/services/exam_attempt_service.py`
- `backend/app/services/scoring_service.py`
- `backend/app/services/ai_risk_service.py`
- `backend/app/schemas/exam.py`
- `backend/app/api/v1/question_banks.py`
- `backend/app/api/v1/exams.py`
- `backend/app/api/v1/exam_reports.py`
- `backend/tests/test_question_bank.py`
- `docs/question-bank-implementation-summary.md` (this file)

**Modified files (all additive — no existing field/behavior removed):**
- `backend/app/db/models/enums.py` — `TestType.PRACTICAL` added (kept `PROBLEM_SOLVING`); new `QuestionBankStatus`, `ExamTemplateStatus`, `ExamAttemptStatus`, `SectionType` enums.
- `backend/app/db/models/test.py` — `Test.question_bank_id`; `Question.quality_score` / `estimated_time_seconds` / `topic_tags_json` / `is_active` / `usage_count`.
- `backend/app/db/models/attempt.py` — `TestAttempt.exam_attempt_id` (back-reference, nullable).
- `backend/app/db/models/evaluation.py` — `Evaluation.section_scores_json` / `model_used` / `raw_model_output_json` (reserved for future use — see Known Limitations).
- `backend/app/db/models/job_description.py` — `JobDescription.exam_config_json` (per-job weight/bank-size overrides).
- `backend/app/db/models/__init__.py` — registers all new models.
- `backend/app/config.py` — `question_bank_mode`, `bank_mcq_minimum/commercial`, `bank_cq_minimum/commercial`, `exam_section_mcq_count/cq_count`, `section_weight_reasoning/practical/technical`.
- `backend/app/services/test_generation_service.py` — added `TestType.PRACTICAL` to `_TEST_TYPE_CONFIG`/`_duration_for_type`; new public `generate_question_batch()` and `build_questions_from_batch()` helpers reused by `question_bank_service` (no change to existing `generate_tests_for_jd()` behavior).
- `backend/app/services/attempt_service.py` — one-line public alias `build_safe_question = _safe_question` for cross-module reuse.
- `backend/app/services/evaluation_service.py` — `evaluate_attempt()` now constrains question loading to the locked subset when `attempt.exam_attempt_id` is set; a no-op for every existing/legacy attempt (field is always `NULL` there).
- `backend/app/worker.py` — new ARQ task `task_evaluate_section_attempt`.
- `backend/app/main.py` — wires `exam_attempt_service.set_arq_pool()` at startup, mirroring the existing `webhook_service` pattern.
- `backend/app/api/v1/router.py` — mounts the 3 new routers.

## 2. New Database Schema / Migrations

One additive migration: `b8d3f0c91a7e_add_question_bank_exam_architecture.py`.
- 1 new enum value (`TestType.PRACTICAL`), 3 new enum types.
- 6 new tables: `question_banks`, `exam_templates`, `exam_attempts`, `exam_attempt_questions`, `ai_risk_signals`, `candidate_reports`.
- Additive columns on `tests`, `questions`, `evaluations`, `test_attempts`, `job_descriptions`.
- Zero drops, zero renames, zero column-type changes — every new FK is nullable or points at a brand-new table, so no backfill is required and the migration is purely additive (continuing this repo's 13-for-13 track record per the Phase 1 audit).

Notably **not** created (per the audit's table-collision findings): no new `job_posts`, `questions`, `candidate_answers`, or `evaluation_results` tables — those would have either collided by name with existing tables or duplicated ~80-95% of `job_descriptions`/`questions`/`candidate_answers`/`evaluations`.

## 3. New Services

| Service | Responsibility |
|---|---|
| `question_bank_service.py` | Generate (in small batches, persisted incrementally — not all-or-nothing), validate completeness against minimum/commercial thresholds, fetch active questions, archive/regenerate, human-review-and-approve a bank |
| `exam_assignment_service.py` | Balanced-randomized, usage-aware locking of 10 MCQ + 5 CQ per section into `exam_attempt_questions`; idempotent; transactional |
| `exam_attempt_service.py` | Wraps per-section `TestAttempt`s in an `ExamAttempt`; section start/resume/submit; enqueues background evaluation instead of running it synchronously |
| `scoring_service.py` | Aggregates the 3 section `Evaluation`s into one weighted, normalized `ExamAttempt` score (configurable per-job weights) |
| `ai_risk_service.py` | Combines behavioral signals (`suspicious_events`) + the existing textual AI-likeness estimate + a peer-answer-similarity check into one hedged `ai_risk_score`, never a verdict |

## 4. New Endpoints

```
POST   /api/v1/jd/{jd_id}/question-bank/generate
POST   /api/v1/jd/{jd_id}/question-bank/regenerate
GET    /api/v1/jd/{jd_id}/question-bank
GET    /api/v1/jd/{jd_id}/question-bank/status
POST   /api/v1/jd/{jd_id}/question-bank/review
PATCH  /api/v1/jd/{jd_id}/question-bank/config

POST   /api/v1/candidate-exams/start
GET    /api/v1/candidate-exams/{exam_attempt_id}/current
POST   /api/v1/candidate-exams/{exam_attempt_id}/section/{section_type}/submit
POST   /api/v1/candidate-exams/{exam_attempt_id}/submit
GET    /api/v1/candidate-exams/{exam_attempt_id}/status

GET    /api/v1/exam-admin/attempts/{exam_attempt_id}/report
GET    /api/v1/exam-admin/jd/{jd_id}/candidates
GET    /api/v1/exam-admin/jd/{jd_id}/results
```
Deviations from Master Prompt 2's literal paths, both deliberate: `jobId` → `jd_id` (this codebase's existing identifier — no parallel "jobs" resource was introduced); `/candidate/exams/:jobId/start` → `POST /candidate-exams/start` with the token in the body (the token alone already identifies the invitation/JD — putting an unauthenticated `jobId` in the path would either duplicate that lookup or require trusting an unverified path segment).

Zero existing routes were modified.

## 5. Test Coverage Added

`backend/tests/test_question_bank.py` — 14 new tests, all passing; **311/311 tests pass overall** (297 pre-existing + 14 new), confirming zero regressions:

1. Bank meets/below/exceeds minimum & commercial thresholds (3 tests)
2. Bank generation disabled-flag guard + full mocked-Ollama generation → persisted, READY
3. Assignment produces exactly 10 MCQ + 5 CQ × 3 sections with zero duplicate question IDs
4. Assignment is idempotent (re-call returns the identical locked rows)
5. Balanced randomization prefers unused questions over used ones
6. Insufficient bank → graceful `ConflictError`, not a crash
7. Missing/not-ready bank → graceful `ConflictError`
8. Full section-by-section flow: start → submit → next section → ... → final SUBMITTED, including a same-section double-submit (idempotent) and a post-submission re-start attempt (409)
9. Score aggregation applies configured per-section weights correctly; raises clearly when a section isn't evaluated yet
10. AI-risk score is bounded [0, 100] and the disclaimer text contains no certainty-claiming language

## 6. How to Run Migrations

```bash
cd backend
alembic upgrade head
```
Reversible: `alembic downgrade -1` (the `TestType.PRACTICAL` enum value is the one documented exception that can't be dropped — matches the existing precedent for `AttemptStatus.TERMINATED`).

## 7. How to Test Locally

```bash
cd backend
./.venv_test/bin/python -m pytest tests -q                       # full suite
./.venv_test/bin/python -m pytest tests/test_question_bank.py -q # new tests only
./.venv_test/bin/python -m ruff check app/ tests/test_question_bank.py
```
To exercise the new flow against a real Ollama instance: set `QUESTION_BANK_MODE=true`, then
`POST /api/v1/jd/{jd_id}/question-bank/generate` (after JD upload + skill extraction), then
`POST /api/v1/jd/{jd_id}/question-bank/review`, then a candidate can `POST /api/v1/candidate-exams/start` with their invitation token.

## 8. Known Limitations

- **Frontend not wired up.** This prompt was explicitly scoped backend-only. The Next.js candidate proxy (`/api/candidate/[...path]`) currently allowlists only `/api/v1/attempts/*` — it needs a new entry for `/api/v1/candidate-exams/*` before any candidate browser can reach these endpoints. No exam UI exists yet either.
- **No cloud AI tier.** Bank generation reuses the existing Ollama-only pipeline (just batched/looped for larger volumes). The local-vs-cloud model split from Master Prompt 1 is unimplemented — `generation_model`/`review_model` fields exist on `QuestionBank` for provenance but nothing routes to a second provider yet.
- **Question review is human-only.** `POST .../question-bank/review` is an admin approve action, not an LLM quality pass — intentional per Master Prompt 1 ("optional"), but worth flagging since the field name might suggest otherwise.
- **Peer answer-similarity is a simple text-normalization match**, not embedding-based semantic similarity — the existing pgvector/embedding infrastructure (used for "similar evaluations") is a natural upgrade path.
- **`Evaluation.section_scores_json`/`model_used`/`raw_model_output_json`** were added but are currently unused — the actual section breakdown lives on `ExamAttempt.metadata_json` instead, since `Evaluation` stays 1:1 with a single section. Left in place for forward compatibility rather than removed.
- **Multi-tenancy remains entirely unimplemented**, per the explicit decision to defer it to its own prompt.
- **All-or-nothing generation risk is reduced, not eliminated** — batches persist incrementally now, but a section that never reaches the minimum threshold after `_MAX_BATCH_BATCHES` (12) attempts still ends the whole bank in `FAILED`, requiring a manual regenerate.

## 9. Recommended Next Implementation Prompt

A focused **"Wire the question bank to the frontend"** prompt: add `/api/v1/candidate-exams/*` to the Next.js candidate proxy allowlist, build the 3-section sequential exam UI (reusing `MCQQuestion`/`OpenEndedQuestion` components), and an admin bank-management screen (generate/review/regenerate, per-section progress, below-recommended warnings). This should precede the AI-orchestration (local+cloud model split) prompt, since there's no UI yet to exercise the bank-generation flow this prompt built.
