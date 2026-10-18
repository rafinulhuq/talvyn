# Talvyn Multi-User Capacity and Scaling Plan

Last updated: 2026-07-18

This document captures the plan for making Talvyn sustainable when many users are using the application at the same time: admins analyzing job descriptions, generating assessments, inviting candidates, candidates taking exams, and the system evaluating submitted work.

It is written for future implementation agents and engineers. Treat it as the operating plan before making scaling changes.

## Current Hardware Target

The first production server is expected to run on:

| Component | Specification |
| --- | --- |
| CPU | Intel Core i7 11th gen |
| GPU | NVIDIA RTX 3060 Ti |
| VRAM | 8 GB |
| RAM | 32 GB DDR4 |
| Storage | 1 TB |

The important constraint is not CPU or RAM. The binding bottleneck is the 8 GB GPU when running local LLM jobs through Ollama.

## Existing Architecture Baseline

Talvyn already has the right production foundation:

| Layer | Current component |
| --- | --- |
| Frontend | Next.js |
| Backend API | FastAPI |
| Database | PostgreSQL with pgvector |
| Queue and shared state | Redis |
| Background jobs | ARQ worker |
| Local AI runtime | Ollama |
| Reverse proxy | Nginx / OpenResty |
| Observability | Prometheus and Grafana |
| File storage option | Local uploads volume or MinIO/S3-compatible storage |

The codebase already includes important scaling primitives:

- Slow AI operations are routed through background worker tasks in `backend/app/worker.py`.
- `WorkerSettings.max_jobs = 1` currently protects the local Ollama path from concurrent GPU overload.
- Redis-backed rate limiting exists in `backend/app/core/ratelimit.py`.
- AI task routing exists in `backend/app/services/ai_task_router_service.py`.
- Batched exam evaluation exists through `task_evaluate_exam_batched`.
- Question bank generation exists as a long-running background task through `task_generate_bank`.

The plan below builds on these existing pieces rather than replacing them.

## Capacity Reality

This server can support many normal application users, but it cannot support many simultaneous local LLM generations.

Approximate safe capacity:

| Workload | Sustainable expectation on this server |
| --- | --- |
| Admin dashboard browsing | Dozens of concurrent users |
| Candidate exam sessions | 50-100 concurrent candidates, assuming DB/API are tuned and exams do not call the LLM during the session |
| JD upload and parsing | Many queued jobs, few active jobs |
| Local JD analysis through Ollama | 1 active job at a time |
| Local test or question generation | 1 active job at a time |
| Full question bank generation | 1 active job, potentially 25-90 minutes |
| Candidate CQ evaluation | Queue and batch; do not evaluate per answer |

The product should therefore behave as a queued multi-user system. It should not behave as if every user gets direct, immediate GPU access.

## Core Design Principle

All heavy AI work must be accepted quickly, queued, processed fairly, and reported clearly.

Target flow:

```text
User action
  -> Fast API validation
  -> Create database record
  -> Enqueue background job
  -> Return job/status id immediately
  -> Worker processes job when capacity is available
  -> Frontend shows progress, queue position, completion, or failure
```

Do not keep browser requests open while local LLM work runs. Long HTTP requests should be considered a production reliability smell.

## Workload Classes

Use separate queues or queue metadata for different job classes.

| Queue | Jobs | Target behavior |
| --- | --- | --- |
| `critical` | Final exam submission, score aggregation, candidate-visible completion states | Highest priority; should not wait behind long generation jobs |
| `normal_ai` | JD analysis, skill extraction, AI checker jobs, standard test generation | Queued; visible progress |
| `slow_ai` | Full question bank generation, regeneration, bulk jobs, RAG indexing | Lowest priority; long-running; cancellable/retryable |
| `io` | Email, webhooks, export, file cleanup | Higher concurrency; not GPU-bound |

The current single ARQ worker can start this way, but the code should evolve toward explicit queue separation as usage grows.

## Recommended Concurrency Settings

For the current 8 GB GPU server:

| Component | Recommended setting |
| --- | --- |
| Uvicorn workers | 2-4 |
| Local Ollama jobs | 1 active job |
| `OLLAMA_NUM_PARALLEL` | `1` |
| `OLLAMA_MAX_LOADED_MODELS` | `1` |
| `OLLAMA_KEEP_ALIVE` | `-1` |
| `OLLAMA_FLASH_ATTENTION` | `1` |
| ARQ local AI worker `max_jobs` | `1` |
| Email/webhook worker concurrency | 5-10 |
| CPU-only AI detector jobs | 1-2, depending on RAM pressure |
| PostgreSQL `max_connections` | 200-250 with app pool limits |
| Redis memory | Monitor; 256 MB is acceptable initially but should be revisited with high job volume |

Do not raise Ollama parallelism on this GPU unless real load testing proves it is stable. For 8 GB VRAM, concurrency should come from queueing, caching, and cloud burst capacity, not multiple local generations.

## Product Behavior Required For Scale

Users should see honest job states:

```text
Queued
Running
Completed
Failed
Cancelled
Retrying
```

For AI-heavy jobs, expose:

- Queue position.
- Estimated start window.
- Current phase, such as `extracting skills`, `generating reasoning section`, or `evaluating submitted answers`.
- Partial progress when possible.
- Clear failure reason and retry action.

This makes queueing feel intentional instead of broken.

## Optimization Strategy

### 1. Pre-Generate Reusable Question Banks

The most important product-level optimization is to avoid generating a new test for every candidate.

Preferred flow:

```text
Admin uploads JD
  -> System extracts skills
  -> System generates a reusable question bank once
  -> Each candidate receives a locked randomized subset
  -> Evaluation happens after submission
```

This converts repeated expensive work into one expensive setup step per job description.

### 2. Batch Candidate Evaluation

Never evaluate each open-ended or coding answer as a separate LLM call.

Preferred:

```text
15 candidate answers -> 1 batched evaluation call
```

Avoid:

```text
15 candidate answers -> 15 LLM calls
```

The existing `task_evaluate_exam_batched` path should remain the default for sectioned exams.

### 3. Route AI Tasks By Cost And Quality Need

Use local AI for cheap and repeated operations:

- JD skill extraction.
- Topic mapping.
- Basic local evaluation.
- Draft summaries.

Use GLM/cloud/provider-backed AI only for quality-critical or exceptional operations:

- Question bank generation.
- Rubric generation.
- Question review.
- Borderline candidates.
- Top candidates.
- High AI-risk candidates.
- Admin-requested deep review.

The existing `ai_task_router_service.py` should remain the central policy layer for this.

### 4. Cache Aggressively

Cache by stable inputs:

| Cache target | Suggested key |
| --- | --- |
| JD text extraction | File hash |
| JD skill extraction | JD text hash + prompt version + model version |
| Generated question bank | JD id + generation settings + prompt version |
| Rubric | JD id + section + prompt version |
| AI checker result | Text hash + detector model version |
| Embeddings | Chunk hash + embedding model version |
| Evaluation prompt result | Attempt id + prompt version + answer hash |

Every cache entry that depends on prompts or models must include a prompt/model version so future prompt changes invalidate correctly.

### 5. Protect Candidate Exam Runtime

Candidate exam-taking must not require live LLM availability.

During the exam:

- Load preassigned questions from the database.
- Autosave answers.
- Grade MCQ deterministically.
- Queue CQ/open-ended/coding evaluation after final submission.
- Show evaluation as pending if needed.

The candidate-facing exam flow should remain fast even if the AI queue is backed up.

### 6. Add Quotas And Fairness

Add limits at three levels:

| Level | Example limits |
| --- | --- |
| User | JD analyses per hour, test generations per day |
| Organization | Max active AI jobs, max queued AI jobs, monthly AI budget |
| Global | Max active local LLM jobs, max active cloud jobs |

The system should prevent one busy admin or organization from starving everyone else.

### 7. Add Backpressure

When the queue is too deep:

- Reject new expensive generation jobs with a clear message.
- Allow admins to schedule jobs for later.
- Allow priority override for super admins.
- Continue allowing normal candidate exam activity.

Example policy:

```text
If slow_ai queue wait estimate > 6 hours:
  block new non-critical generation jobs
  show "AI generation queue is full"
  allow retry later or cloud-burst option
```

## Data Model Additions

Future implementation should add or formalize a durable job table.

Recommended fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable job id shown to frontend |
| `organization_id` | Tenant fairness and reporting |
| `user_id` | Per-user limits |
| `job_type` | JD analysis, bank generation, evaluation, etc. |
| `queue_name` | `critical`, `normal_ai`, `slow_ai`, `io` |
| `status` | `queued`, `running`, `completed`, `failed`, `cancelled`, `retrying` |
| `priority` | Numeric priority |
| `idempotency_key` | Prevent duplicate jobs |
| `input_hash` | Cache and duplicate detection |
| `progress_percent` | Frontend progress |
| `progress_message` | Human-readable status |
| `attempt_count` | Retry tracking |
| `max_attempts` | Retry cap |
| `error_code` | Machine-readable failure |
| `error_message` | Admin-readable failure |
| `created_at` | Queue metrics |
| `started_at` | Job duration |
| `finished_at` | Job duration |
| `cancelled_at` | Cancellation |

Redis can still hold short-lived progress for speed, but PostgreSQL should hold the durable source of truth.

## Observability Requirements

Add dashboards and alerts for:

| Metric | Why it matters |
| --- | --- |
| AI queue depth by queue | Shows whether users are backing up |
| Oldest queued job age | Best indicator of user pain |
| Job duration P50/P90/P99 by type | Capacity planning |
| Job failure rate by type | Reliability |
| Ollama request duration | GPU/model bottleneck |
| Ollama error rate | Local AI health |
| GPU VRAM used | Prevent overload |
| GPU utilization | Confirm bottleneck |
| API latency P95/P99 | User-facing health |
| DB connection usage | Prevent connection exhaustion |
| Redis memory and evictions | Protect queue/progress state |
| Candidate autosave failures | Candidate experience |

Alerts should be created for:

- Oldest critical job age over 2 minutes.
- Oldest normal AI job age over 30 minutes.
- Oldest slow AI job age over 6 hours.
- AI job failure rate over 10% in 15 minutes.
- Redis evictions above zero for queue keys.
- PostgreSQL connections above 80%.
- Disk usage above 80%.

## Deployment Shape

Initial single-server deployment:

```text
Nginx
  -> Next.js
  -> FastAPI
  -> PostgreSQL
  -> Redis
  -> ARQ worker
  -> Native Ollama on host GPU
```

Next scaling step:

```text
Main app server:
  Next.js, FastAPI, PostgreSQL, Redis

GPU worker server:
  ARQ local_ai worker, Ollama

Optional cloud provider:
  GLM/OpenAI-compatible provider for burst and deep review
```

Do not scale by adding more web workers alone. If queue age is high, the bottleneck is likely AI inference, not the FastAPI process.

## Implementation Estimate

These estimates assume one experienced full-stack engineer or agent working in this existing codebase. They include implementation and basic tests, but not extended production burn-in.

| Phase | Work | Estimate |
| --- | --- | --- |
| Phase 1 | Job-state cleanup, durable job table, progress API, frontend progress display, basic retry/failure UX | 5-8 working days |
| Phase 2 | Queue separation, priority handling, per-user/per-org/global quotas, queue backpressure | 5-7 working days |
| Phase 3 | Cache keys and invalidation for JD analysis, skill extraction, AI checker, question banks, embeddings | 4-6 working days |
| Phase 4 | Candidate runtime hardening: guarantee no LLM dependency during exam, improve autosave and pending evaluation states | 3-5 working days |
| Phase 5 | Observability dashboards and alerts for queues, jobs, API, DB, Redis, Ollama/GPU | 4-6 working days |
| Phase 6 | Cloud burst/deep-review routing hardening, provider fallback behavior, cost tracking | 4-7 working days |
| Phase 7 | Load testing, tuning, documentation, runbooks, production readiness pass | 5-8 working days |

Total estimate:

```text
Minimum: 30 working days
Likely: 40 working days
Conservative: 50 working days
```

For a single engineer, this is roughly 6-10 calendar weeks depending on interruptions, production issues, and how much frontend polish is required.

For two engineers working in parallel:

```text
Likely: 4-6 calendar weeks
```

Parallelization works best if one engineer owns backend/queues/observability while the other owns frontend job UX, admin controls, and candidate runtime polish.

## Milestone Plan

### Milestone 1: Make Async Work Visible

Goal: no heavy AI action feels stuck.

Deliverables:

- Durable job status model.
- Job status API.
- Frontend status UI for JD analysis, test generation, question bank generation, and evaluation.
- Retry button for failed jobs.
- Basic admin-visible error messages.

Acceptance criteria:

- Starting a long AI job returns immediately.
- Refreshing the page still shows the correct job state.
- Failed jobs show why they failed.
- A future agent can inspect a DB row and know what happened.

Estimate: 5-8 working days.

### Milestone 2: Protect The GPU With Fair Queues

Goal: many users can request work without overwhelming the GPU.

Deliverables:

- Queue names or equivalent job classes.
- Local AI concurrency stays capped at 1.
- Critical jobs are not blocked behind slow bank generation.
- Per-user and per-organization AI job limits.
- Global queue-depth backpressure.

Acceptance criteria:

- 20 simultaneous generation requests queue instead of crashing the server.
- Candidate finalization is not delayed behind a full bank generation job.
- One user cannot monopolize the entire AI queue.

Estimate: 5-7 working days.

### Milestone 3: Reduce Repeated AI Work

Goal: the system does less work per user.

Deliverables:

- Stable cache keys for JD text and skill extraction.
- Cache-aware question bank generation.
- Prompt/model versioning for invalidation.
- AI checker text-hash reuse.
- Embedding/chunk cache checks.

Acceptance criteria:

- Re-uploading the same JD does not repeat all expensive work.
- Regeneration only happens when inputs, settings, prompt version, or model version change.
- Cache hits are visible in logs or metrics.

Estimate: 4-6 working days.

### Milestone 4: Harden Candidate Exam Flow

Goal: candidates are isolated from AI queue delays while taking exams.

Deliverables:

- Confirm all exam content is preassigned before start.
- Confirm no live generation runs during the exam session.
- Improve autosave reliability and status feedback.
- Make pending evaluation state explicit after submission.
- Ensure MCQ scoring is deterministic and immediate.

Acceptance criteria:

- Candidate can complete exam while Ollama is offline.
- Submitted answers are not lost if evaluation fails.
- Admin can retry evaluation later.

Estimate: 3-5 working days.

### Milestone 5: Add Operational Visibility

Goal: operators know before users complain.

Deliverables:

- Prometheus metrics for job counts, job ages, durations, failures.
- Grafana dashboard for queue health.
- GPU/Ollama health panel.
- API/DB/Redis health panels.
- Alert rules for queue age, failures, Redis eviction, DB saturation, disk usage.

Acceptance criteria:

- Operator can answer: "What is the oldest queued AI job?"
- Operator can answer: "Which job type is failing?"
- Operator can answer: "Is the GPU the bottleneck right now?"

Estimate: 4-6 working days.

### Milestone 6: Add Hybrid AI Scaling

Goal: use the local GPU sustainably while allowing quality and burst capacity.

Deliverables:

- Harden GLM/OpenAI-compatible provider configuration.
- Cost/usage logging by organization and task.
- Deep-review trigger audit trail.
- Fallback behavior from cloud to local or local to cloud where appropriate.
- Admin controls for provider selection if needed.

Acceptance criteria:

- Question generation can use cloud provider when configured.
- Local fallback behavior is deterministic.
- Expensive provider usage is logged and attributable.

Estimate: 4-7 working days.

### Milestone 7: Load Test And Tune

Goal: prove the system survives realistic use.

Test scenarios:

- 20 admins enqueue JD/test generation jobs.
- 50 candidates take exams concurrently.
- 20 candidates submit exams in a short window.
- One question bank generation runs while normal exams continue.
- Ollama becomes unavailable during queued work.
- Redis restarts.
- Backend restarts during queued work.

Deliverables:

- Load test scripts or documented commands.
- Before/after metrics.
- Tuned worker counts and DB pool settings.
- Production runbook.
- Updated deployment documentation.

Acceptance criteria:

- No candidate answer loss.
- No API-wide outage from AI queue pressure.
- Queue behavior is observable.
- Recovery steps are documented.

Estimate: 5-8 working days.

## Implementation Order

Recommended order:

1. Durable job table and status API.
2. Frontend job progress UX.
3. Queue separation and priority.
4. Quotas and backpressure.
5. Caching and invalidation.
6. Candidate runtime hardening.
7. Observability and alerting.
8. Hybrid cloud/provider scaling.
9. Load testing and runbooks.

Do not start by raising GPU concurrency. That creates instability without solving the real product problem.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| GPU saturation | Long waits, failed generations | Keep local AI concurrency at 1, expose queue status, add cloud burst |
| Long jobs block critical jobs | Candidate results delayed | Separate queues and priority |
| Duplicate generation | Wastes hours of GPU time | Idempotency keys and cache hashes |
| Prompt changes produce stale caches | Incorrect reuse | Prompt/model versioning in every cache key |
| Redis eviction loses progress | Confusing UI | Durable DB job state plus Redis only for fast progress |
| DB connection exhaustion | API outage | Pool limits, Postgres tuning, metrics |
| Candidate depends on live AI | Exam disruption | Preassign questions and evaluate after submit |
| One tenant monopolizes capacity | Unfair system | Per-user/per-org quotas |
| Cloud cost surprise | Budget risk | Usage logging, per-org budget limits, admin controls |

## Agent Notes

Future agents should inspect these files before implementation:

- `backend/app/worker.py`
- `backend/app/core/ratelimit.py`
- `backend/app/services/ai_task_router_service.py`
- `backend/app/services/question_bank_service.py`
- `backend/app/services/cq_batch_evaluation_service.py`
- `backend/app/services/jd_service.py`
- `backend/app/services/test_generation_service.py`
- `docker-compose.prod.yml`
- `prometheus/prometheus.yml`
- `grafana/provisioning/datasources/prometheus.yml`

The main architectural decision is already made: heavy AI work must be backgrounded, queued, capped, cached, and observable.

