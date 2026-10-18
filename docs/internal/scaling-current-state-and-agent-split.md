# Talvyn Scaling Current State And Claude/Codex Work Split

Last updated: 2026-07-18

This document corrects the broad scaling roadmap in `multi-user-capacity-plan.md` after a deeper code audit. It exists so future agents do not rebuild features that are already present.

## Audit Summary

The application is further along than a greenfield scaling plan. Several core pieces for multi-user AI operations already exist.

## Already Implemented

| Area | Evidence | Notes |
| --- | --- | --- |
| Background AI jobs | `backend/app/worker.py` | ARQ worker handles JD parsing, skill extraction, test generation, question bank generation, AI checker, webhooks, and batched exam evaluation. |
| Local AI concurrency cap | `backend/app/worker.py` | `WorkerSettings.max_jobs = 1`, matching the 8 GB VRAM safety model. |
| Redis progress for test generation | `backend/app/services/test_generation_service.py` | Progress is stored in Redis with `step`, `pct`, and `detail`. |
| Test generation progress API | `backend/app/api/v1/tests.py` | Provides snapshot and SSE stream endpoints. |
| Test generation frontend progress | `frontend/src/components/admin/GenerateTestsButton.tsx` | Uses SSE plus polling and has timeout/failure handling. |
| Cross-page generation banner | `frontend/src/contexts/GenerationContext.tsx` | Uses `sessionStorage` and backend verification. |
| Question bank generation | `backend/app/services/question_bank_service.py` and `backend/app/api/v1/question_banks.py` | Generates reusable bank in background and exposes status/progress. |
| Question bank frontend progress | `frontend/src/components/admin/QuestionBankPanel.tsx` | Uses SSE progress and status refresh. |
| Question bank data model | `backend/app/db/models/question_bank.py` | Includes `QuestionBank`, `ExamTemplate`, `ExamAttempt`, `ExamAttemptQuestion`, `AiRiskSignal`, and `CandidateReport`. |
| Locked per-candidate question assignment | `backend/app/db/models/question_bank.py`, `backend/app/services/exam_assignment_service.py` | `ExamAttemptQuestion` locks exact questions per candidate. |
| Batched exam evaluation | `backend/app/worker.py`, `backend/app/services/cq_batch_evaluation_service.py` | Whole exam CQ evaluation is queued once after final submission. |
| Rate limiting | `backend/app/core/ratelimit.py` and route decorators | Redis-backed SlowAPI rate limits exist across JD upload/analyze, test generation, evaluation, attempts, invitations, public links, CMS, and AI checker. |
| Health checks | `backend/app/api/v1/health.py` | Liveness, readiness, model routing, DB, Redis, Ollama, storage, email, magic link, and CORS checks exist. |
| Prometheus HTTP instrumentation | `backend/app/main.py`, `prometheus/prometheus.yml` | FastAPI is instrumented and Prometheus scrapes `/metrics`. |
| Hybrid local/cloud AI provider | `backend/app/services/ai_provider_service.py`, `backend/app/services/ai_task_router_service.py` | Local Ollama and OpenAI-compatible GLM routing exist. |
| AI usage logging | `backend/app/db/models/ai_usage.py`, `backend/app/services/ai_usage_service.py` | Logs provider, model, task, latency, token usage when available, and success/failure. |
| Candidate-facing test cache | `backend/app/services/attempt_service.py` | Approved tests are cached in Redis and invalidated on admin mutations. |
| RAG/embedding infrastructure | `backend/app/services/rag/*`, `backend/app/db/models/knowledge.py` | Optional JD corpus RAG and pgvector storage exist. |
| Startup stuck-job recovery | `backend/app/main.py` | Stuck JD `GENERATING`/`EXTRACTING` states reset to `FAILED` after backend restart. |
| Test generation cancel endpoint | `backend/app/api/v1/tests.py` | Admin can reset a stuck generation to `IDLE`; worker discards stale results. |

## Partially Implemented

| Area | Current state | Remaining gap |
| --- | --- | --- |
| Durable job observability | Status is stored across domain tables: `JobDescription.generation_status`, `QuestionBank.status`, `ExamAttempt.status`, Redis progress keys, AI checker job keys. | There is no single durable `background_jobs` or `ai_jobs` table that lists all queued/running/failed/completed jobs across the system. |
| Queue priority | ARQ worker exists and local concurrency is capped. | All registered worker functions share one worker settings class; long slow jobs can still occupy the only worker slot ahead of critical work. |
| Queue/operator dashboard | Individual pages show progress for specific JDs/banks. | There is no global admin queue dashboard showing all active/queued/failed/recent jobs. |
| Quotas/backpressure | Route-level rate limiting exists. | There are no durable per-user/per-org/global active queued AI-job limits or queue-depth rejection rules. |
| Observability | Basic HTTP metrics and readiness checks exist. | Need job-specific Prometheus metrics: queue depth, oldest queued age, job duration by type, job failure rate, and worker heartbeat. |
| Caching | Candidate test cache, RAG document hash dedupe, and frontend fetch cache controls exist. | AI-result cache is not generalized for JD skill extraction, AI checker text hash reuse, question bank prompt/model version reuse, or safe evaluation reuse. |
| Cloud routing | Provider abstraction, fallback, and usage logs exist. | Needs production hardening: provider budget limits, admin-visible usage, stronger fallback tests, and task-level cost reporting. |

## Not Yet Implemented

| Area | Needed work |
| --- | --- |
| Unified durable AI job table | A normalized table for all long-running jobs with owner, job type, status, priority, timestamps, idempotency key, error, and progress. |
| Explicit queue separation | Separate critical/normal/slow/io queues or equivalent worker pools so candidate finalization is not blocked by full bank generation. |
| Queue position / wait estimate | User-facing and admin-facing queue metadata. |
| Per-user and per-org AI job quotas | Fairness controls beyond simple route rate limits. |
| Queue backpressure | Reject or defer new expensive jobs when queue wait is too high. |
| Global queue dashboard | Admin/operator view of running, queued, failed, completed jobs. |
| Job metrics dashboard | Grafana dashboard for queue health and AI worker health. |
| Load-test scripts | Scenarios for concurrent admins, candidates, submissions, Ollama outage, Redis restart, backend restart. |

## Corrected Implementation Estimate

Because many foundations are already built, the remaining work is smaller than the broad greenfield estimate.

| Workstream | Estimate |
| --- | --- |
| Unified durable job table and API | 4-6 working days |
| Bridge existing JD/question bank/exam/AI checker flows into unified jobs | 5-8 working days |
| Queue separation and priority | 4-7 working days |
| Quotas and backpressure | 4-6 working days |
| Admin global queue dashboard | 3-5 working days |
| Job-specific metrics and Grafana dashboard | 4-6 working days |
| AI-result caching hardening | 4-7 working days |
| Cloud/provider usage hardening | 3-5 working days |
| Load testing and runbooks | 5-8 working days |

Revised total:

```text
Minimum: 30 working days
Likely: 38 working days
Conservative: 48 working days
```

The total remains close to the earlier estimate because the remaining work is integration-heavy and must avoid breaking existing production flows. The difference is that agents should not rebuild progress bars, question banks, batched evaluation, rate limiting, basic metrics, or provider routing from scratch.

## Claude And Codex Parallel Split

Use this split to reduce conflicts.

### Codex Ownership

Codex should own backend, database, worker, metrics, and tests.

Primary files:

- `backend/app/worker.py`
- `backend/app/db/models/`
- `backend/alembic/versions/`
- `backend/app/api/v1/`
- `backend/app/services/`
- `backend/app/schemas/`
- `backend/tests/`
- `prometheus/`
- `docker-compose*.yml` when needed

### Claude Ownership

Claude should own frontend UX, operator screens, documentation, and review.

Primary files:

- `frontend/src/components/admin/`
- `frontend/src/app/(admin)/dashboard/`
- `frontend/src/lib/api/`
- `frontend/src/types/`
- `docs/`
- `mkdocs.yml` when documentation nav changes

## Revised Milestones

### Milestone 1A: Unified Durable Job Registry

Owner: Codex

Goal: Add a normalized durable job table without removing existing domain-specific statuses.

Scope:

- Add `background_jobs` or `ai_jobs` table.
- Include job type, queue name, priority, owner, status, idempotency key, progress fields, error fields, and timestamps.
- Add Alembic migration.
- Add service helpers.
- Add job status/list API.
- Bridge one low-risk flow first, preferably legacy test generation or question bank generation.
- Keep existing `JobDescription.generation_status`, `QuestionBank.status`, `ExamAttempt.status`, and Redis progress as compatibility layers.

Do not:

- Remove existing SSE progress.
- Remove existing status endpoints.
- Rebuild question bank or exam evaluation.

Estimate: 4-6 working days.

### Milestone 1B: Unified Job API Client And Operator UI Skeleton

Owner: Claude

Goal: Add frontend support for the new unified job status without replacing existing progress screens immediately.

Scope:

- Add TypeScript types and API client for unified jobs.
- Add a global admin queue page or panel.
- Show active, queued, failed, and recently completed jobs.
- Reuse existing UI primitives.
- Link job rows back to JD/question bank/exam pages when IDs are available.

Estimate: 3-5 working days.

### Milestone 2A: Queue Separation And Priority

Owner: Codex

Goal: Prevent slow AI work from blocking critical candidate work.

Scope:

- Split worker queues into `critical`, `normal_ai`, `slow_ai`, and `io`, or implement equivalent priority routing that ARQ can support cleanly.
- Keep local Ollama concurrency at 1.
- Ensure final exam submission/evaluation orchestration is not stuck behind bank generation.
- Add tests for enqueue routing and priority behavior.

Estimate: 4-7 working days.

### Milestone 2B: Queue State UX

Owner: Claude

Goal: Make queued work understandable.

Scope:

- Surface queue name, status, started time, runtime, and failure reason.
- Add copy that explains queued AI work without implying the app is broken.
- Keep existing per-JD and per-bank progress UI.

Estimate: 2-4 working days.

### Milestone 3A: Quotas And Backpressure

Owner: Codex

Goal: Add fairness controls beyond route-level rate limiting.

Scope:

- Enforce max active/queued expensive jobs per user.
- Add global max queued expensive jobs.
- Add organization limit if organization model exists; otherwise design the table/service to support it later.
- Return structured errors for limit exceeded and queue full.
- Add tests.

Estimate: 4-6 working days.

### Milestone 3B: Quota And Queue-Full UX

Owner: Claude

Goal: Make quota/backpressure responses clear.

Scope:

- Show queue-full and limit-reached states on JD analysis, test generation, question bank generation, and AI checker flows.
- Keep messages non-technical.
- Add retry-later guidance.

Estimate: 2-3 working days.

### Milestone 4A: Job-Specific Metrics

Owner: Codex

Goal: Add Prometheus metrics for AI jobs, not just HTTP requests.

Scope:

- Queue depth by queue/status/type.
- Oldest queued job age.
- Job duration histogram.
- Job failure counter.
- Worker heartbeat.
- Ollama request duration/error counters if not already exposed.

Estimate: 4-6 working days.

### Milestone 4B: Grafana Dashboard And Runbook

Owner: Claude

Goal: Give operators a practical view of system health.

Scope:

- Add dashboard documentation or provisioning where practical.
- Write runbooks for stuck queue, failed job, Ollama down, Redis down, high queue age.
- Update docs navigation.

Estimate: 3-5 working days.

### Milestone 5A: AI-Result Cache Hardening

Owner: Codex

Goal: Reduce repeated AI work safely.

Scope:

- Add prompt/model versioned cache keys for safe repeated AI outputs.
- Start with JD skill extraction and AI checker text hash reuse.
- Evaluate question bank reuse only when JD hash, settings, prompt version, and model version match.
- Log cache hits/misses.
- Add invalidation tests.

Estimate: 4-7 working days.

### Milestone 5B: Cache UX And Docs

Owner: Claude

Goal: Explain and expose cache behavior where useful.

Scope:

- Add admin-visible hints only where helpful, such as "Using existing analysis for identical JD".
- Document cache invalidation behavior.

Estimate: 1-3 working days.

### Milestone 6A: Provider Usage Hardening

Owner: Codex

Goal: Make existing hybrid AI routing production-ready.

Scope:

- Strengthen fallback tests.
- Add usage aggregation endpoints by task/provider/date.
- Add budget-limit hooks if needed.
- Ensure cloud provider failures do not break local-only mode.

Estimate: 3-5 working days.

### Milestone 6B: Admin Usage View And Deployment Docs

Owner: Claude

Goal: Make AI provider usage understandable.

Scope:

- Show provider/task usage if backend endpoints exist.
- Document local-only vs hybrid mode.
- Document required env vars.

Estimate: 2-4 working days.

### Milestone 7: Load Testing

Owner: Codex primary, Claude docs support

Goal: Prove the scaling behavior.

Scenarios:

- 20 admins enqueue AI generation work.
- 50 candidates take sectioned exams.
- 20 candidates submit in a short window.
- One question bank generation runs while exams continue.
- Ollama outage during queued work.
- Redis restart.
- Backend restart.

Estimate: 5-8 working days.

## Coordination Rules

1. Codex defines backend API shapes before Claude deeply integrates frontend screens.
2. Claude can build skeleton UI against documented response shapes, but should avoid hardcoding fields that Codex has not committed.
3. Do not delete existing status endpoints until the unified job table has compatibility coverage.
4. Keep local AI concurrency at 1 on the RTX 3060 Ti 8 GB server.
5. Every milestone must include tests or a clear reason why tests were not possible.
6. Every milestone must add a changelog note under `docs/changelog/`.

