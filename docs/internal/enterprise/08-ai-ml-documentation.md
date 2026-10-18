# 08. AI/ML Documentation

> Audience: AI engineers, technical leads, and business stakeholders. Each section opens
> with a plain-language summary before the technical detail. All claims below are
> verified against the live codebase on 2026-06-18 — see `docs/enterprise/_facts.md`
> for the cross-file source of truth.

---

## 1. Models Used

**Business summary:** Talvyn does not call OpenAI, Anthropic, or any other paid AI
vendor for its core product (skill extraction, test generation, candidate evaluation).
It runs an open-weight model (Google's Gemma 3) on the company's own server, via
[Ollama](https://ollama.com), a self-hosted LLM runtime. Two things follow: **cost**
— no per-token or per-request bill from a third party, only the hardware already
running the platform plus electricity, so running the system 10 times or 10,000
times a month doesn't change the AI line item; and **data privacy** — job
descriptions, candidate answers, and evaluation text never leave the host running
the containers, since there is no network call to an external AI API anywhere in
the pipeline.

**Technical detail.** `backend/app/config.py` defines the defaults:

```python
ollama_base_url: str = "http://localhost:11434"
ollama_model: str = "gemma3:4b"
ollama_timeout_seconds: int = 600
ollama_max_retries: int = 3

embedding_enabled: bool = False
ollama_embedding_model: str = "nomic-embed-text"
```

The actual model used at runtime is not fixed — `start.sh` auto-detects the host's
GPU VRAM (via `nvidia-smi`) or, absent a GPU, total RAM and CPU core count, and
selects one of six hardware profiles, each writing a different `OLLAMA_MODEL` (plus
matching question counts and timeout) into the gitignored `backend/.env.hardware`
file that `docker-compose.yml` loads:

|Profile|Trigger|Model|MCQ / OE per test|Parallelism|Timeout|
|---|---|---|---|---|---|
|`ultra`|GPU, ≥16 GB VRAM|`gemma3:27b`|5 / 2|3 parallel|900s|
|`high`|GPU, ≥8 GB VRAM|`gemma3:12b`|5 / 2|2 parallel|600s|
|`medium`|GPU, ≥4 GB VRAM|`gemma3:4b`|5 / 2|1 (sequential)|600s|
|`low`|GPU, ≥2 GB VRAM|`gemma3:1b`|3 / 1|1 (sequential)|300s|
|`cpu_fast`|No GPU, RAM ≥16 GB|`gemma3:4b`|3 / 1|1 (sequential)|900s|
|`cpu_slow`|No GPU, RAM <16 GB|`gemma3:1b`|2 / 1|1 (sequential)|1200s|

All six profiles use the **Gemma 3** family at different parameter counts — larger
models are reserved for hardware with enough VRAM to hold them, and the same
generation/evaluation code path works unmodified against any of them because the
prompt-and-validate pattern (Section 2) does not depend on model size. The embedding
model, `nomic-embed-text` (~274 MB, 768-dim output), is separate and always small —
CPU-friendly by design so it never competes with the main generation model for VRAM.

**Updated 2026-06-21:** `OLLAMA_MODEL` is no longer assumed to always be a
Gemma 3 tag. `backend/app/prompts/` resolves the configured model to a
family-tuned prompt set (currently `gemma3` and `qwen2.5-coder`) so the
exact wording in Section 2 below is the Gemma-family version specifically
— a different family uses its own tuned templates, not these verbatim. See
`docs/ai-prompt-registry.md`. `./start.sh --model <tag>` overrides the
auto-picked model for testing a different family without losing the
hardware-tuned timeout/parallelism/question-count settings above.

---

## 2. Prompt Flows

**Business summary.** Talvyn has no retrieval-augmented generation (RAG) pipeline
— no vector search against a document store feeding context into prompts at
generation time (the only vector store usage is the opt-in similarity search in
Section 3, a *lookup* feature, not a generation-context feature). What the platform
has instead is three independent "prompt flows": structured tasks where a
well-defined prompt is sent to the model, the JSON it returns is strictly validated,
and the model gets a second chance with its own error message if it gets the shape
wrong. This is closer to "function calling with a self-correcting retry loop" than
to RAG, and is documented as such rather than forced into an unrelated framing.

**Technical detail — the shared pattern.** All three pipelines (`skill_extraction_service.py`,
`test_generation_service.py`, `evaluation_service.py`) implement the same sequence:
(1) **build prompt** — a template combining a fixed system prompt (role + strict
output rules) with task-specific content (JD text, role context, rubric, candidate
answer); (2) **call Ollama with JSON-mode enforcement** —
`ollama_client.generate(prompt, system, ...)` sets `"format": "json"` on every
`/api/generate` request, an Ollama-level constraint on token sampling, not a
guarantee — the response cleaner (`_extract_json_from_text`) still strips markdown
fences models occasionally emit anyway; (3) **Pydantic-validate the response** —
each service defines its own schema (`SkillExtractionResult`, `GeneratedTestAI`,
`OpenEndedEvalAI`, `AggregateEvalAI`) and calls `.model_validate()`; (4) **on
validation failure, send a correction prompt** — the Pydantic error (truncated to
4-8 errors) is embedded into a follow-up prompt repeating the required JSON shape,
with a different seed per retry; (5) **raise a typed error if retries exhaust** —
`AIResponseParseError` (validation never succeeds) or `AIServiceError` (Ollama
unreachable/erroring), both in `backend/app/core/exceptions.py`.

The maximum correction-attempt count is **not the same constant across all three**
pipelines — each was tuned independently:

|Pipeline|Constant|Value|Total attempts (initial + corrections)|
|---|---|---|---|
|Skill extraction|`max_correction_attempts` param, default|2|3|
|Test generation|`MAX_CORRECTION_ATTEMPTS`|3|4|
|Evaluation (open-ended/code/aggregate)|`MAX_CORRECTION_ATTEMPTS`|2|3|

Separately, `ollama_service.OllamaClient._post_with_retry` retries the *transport*
layer (connection refused, timeout, 5xx) up to `ollama_max_retries` (default 3) times
with exponential backoff (2s → 4s → 8s) — this is independent of and happens
underneath the correction-prompt retries above; a single "correction attempt" can
itself trigger up to 3 transport retries if Ollama is flaky.

### 2.1 Skill Extraction

**Purpose:** Turn raw, unstructured job-description text into a structured record —
job title, seniority level, must-have skills, nice-to-have skills, tools/technologies,
responsibilities, recommended test topics, and an easy/medium/hard difficulty
distribution that sums to exactly 100. The Pydantic schema (`SkillExtractionResult`)
enforces the 100% sum via a custom validator and backfills `recommended_test_topics`
from `must_have_skills` if the model leaves it empty.

**Trigger:** `POST /jd/{jd_id}/analyze` (rate-limited 5/minute) enqueues the ARQ task
`task_extract_skills`, which calls `jd_service.extract_skills_background` →
`skill_extraction_service.extract_skills_from_jd_text`. Requires the JD's
`parse_status == DONE` (text already extracted from the uploaded PDF/DOCX) and
non-empty `raw_text`; otherwise the endpoint returns 409/422 without queuing
anything. JD text longer than 12,000 characters is truncated before prompting, to
stay within the model's context window.

### 2.2 Test Generation

**Purpose:** Generate three distinct assessment tests per JD — Technical, Reasoning,
and Problem-Solving — each containing a configurable number of MCQ and open-ended
questions (`test_mcq_count` / `test_oe_count`, tuned by hardware profile per Section
1). The prompt embeds the extracted skills, the admin's chosen difficulty
distribution (converted into target easy/medium/hard question counts via a
largest-remainder rounding method so the counts always sum correctly), and per-test-type
style guidance (e.g. Technical favors framework-internals and debugging questions;
Reasoning favors ambiguous real-world judgment calls; Problem-Solving favors concrete
role-specific scenarios). The response schema `GeneratedTestAI` enforces exactly 4
MCQ options with exactly one marked correct, minimum word counts on explanations and
rubrics, and exact difficulty enum values.

**Trigger:** `POST /tests/generate/{jd_id}` (rate-limited 3/minute) returns 202 and
enqueues `task_generate_tests`, which runs `generate_tests_background` →
`generate_tests_for_jd`. A single test can also be regenerated via
`POST /tests/{test_id}/regenerate` → `regenerate_single_test`, which replaces only
that test's questions.

Generation mode depends on hardware: when `test_sequential_generation` is true
(default, and mandatory whenever `OLLAMA_NUM_PARALLEL=1`), the three test types are
generated one at a time to avoid queuing the 2nd/3rd request behind Ollama's single
inference slot until they exceed the read timeout. On hardware configured for
parallel inference (`ultra`/`high` profiles), all three run concurrently via
`asyncio.gather`.

**All-or-nothing persistence — verified, not assumed.** If any of the 3 test types
fails validation after exhausting its correction attempts, `generate_tests_for_jd`
raises `AIResponseParseError` **before persisting any of the three tests** — even
the ones that succeeded are discarded (the comment in the source is explicit: *"a
partial result (e.g. 2 of 3 test types generated) would leave the JD with an
incomplete test set while still reporting READY"*). The caller's exception handler
then rolls back the session and sets `generation_status = FAILED`. There is no
partial test set ever visible to an admin — it's all 3 or none.

### 2.3 Evaluation

**Purpose:** Score a candidate's completed attempt and produce a hire/no-hire
recommendation. This pipeline actually issues several separate Ollama calls per
attempt: one per open-ended/code answer (run concurrently via `asyncio.gather`, so
wall-clock time approximates the slowest single answer rather than the sum of all of
them), plus one final "aggregate" call that synthesizes strengths, weaknesses, a
recommendation, a summary, improvement suggestions, and a suitable-role label from
all the per-question results. MCQ questions are scored deterministically in code, not
by the model (see Section 4).

**Trigger:** `POST /evaluation/trigger` (rate-limited 5/minute) calls
`evaluation_service.evaluate_attempt` **synchronously** — unlike the other two
pipelines, this one is not queued through ARQ; the HTTP request itself waits for all
Ollama calls to finish (documented expected duration: 30–120 seconds). It requires
the attempt's status to be `SUBMITTED`, and is idempotent — re-triggering deletes and
replaces any prior evaluation for that attempt.

---

## 3. Embedding System (opt-in)

**Business summary.** This is an optional "find similar candidates" feature, not
part of the core grading pipeline, and it is **off by default**. If enabled, the
system converts each candidate's AI-written evaluation summary into a numeric
fingerprint and lets an admin ask, for a given candidate, "show me other candidates
whose evaluation reads similarly" — useful for spotting clusters of similar
strengths/weaknesses across a hiring pool. It is explicitly designed to fail
silently, so turning it on (or having it break) can never stop a candidate's test
from being scored.

**Technical detail.** Controlled by `EMBEDDING_ENABLED` (default `false`) in
`backend/app/config.py`. When enabled: it embeds the AI-written evaluation summary
text — the concatenation of `agg.summary`, a `"Strengths: ..."` line, a
`"Weaknesses: ..."` line, and a `"Suitable role: ..."` line (built in
`evaluation_service._persist_evaluation`) — never raw candidate answers or the job
description. The model is `nomic-embed-text` (configurable via
`OLLAMA_EMBEDDING_MODEL`), called via Ollama's `/api/embeddings` endpoint; output
must be exactly 768-dimensional (`EMBEDDING_DIM = 768`) or it's discarded. Storage is
the `evaluations.embedding` column, a pgvector `vector(768)` type added by Alembic
migration `db7cdbbfd2a8`, which also enables the pgvector extension and an HNSW
index. It enables `GET /evaluation/{attempt_id}/similar`, which runs a
cosine-distance query (`embedding <=> CAST(:emb AS vector)`) against every other
evaluation with a non-null embedding, returning the closest matches with candidate
name, percentage, and AI recommendation.

**Fail-safe design.** Every failure path in `generate_embedding()` returns `None`
rather than raising: feature disabled, empty input text, Ollama HTTP 404 (model not
pulled), any other exception (connection error, timeout, malformed response — caught
by a blanket `except Exception`), or an embedding response that's missing or not
exactly 768-dim. The call site treats `None` as "leave the column NULL," never as an
error — `_persist_evaluation` always saves the `Evaluation` row regardless.
`find_similar_evaluations` mirrors this: it returns an empty list (not an error) if
this evaluation or every other one lacks an embedding, and only raises
`NotFoundError` if the attempt has no evaluation at all.

---

## 4. Evaluation Methodology

**Business summary.** Talvyn scores two kinds of questions two different ways.
Multiple-choice questions are graded by exact, deterministic comparison in code —
no AI judgment call, so the same MCQ answer always produces the same
correct/incorrect verdict. Open-ended written answers and code submissions are
graded by the AI model against the question's specific scoring rubric, with
explicit "be strict, don't be generous" instructions to counter the tendency of LLMs
to give everyone a passing grade. The final hire/no-hire recommendation is then
computed by deterministic threshold rules layered on top of the AI's narrative
judgment — the AI cannot, by design, override the numeric math.

**Technical detail — MCQ scoring.** Implemented in `evaluation_service._score_mcqs`.
Each MCQ's 4 options are shuffled per-attempt for anti-cheating purposes when served
to the candidate (`attempt_service._safe_question`, seeded with
`random.Random(attempt_id + question.id)`), so the candidate's selected "B" may not
match the database's stored "B". Scoring reverses this exactly: `_resolve_original_label`
re-runs the identical seeded shuffle to recover which original label ended up at the
chosen position, then exact-matches it (case-insensitive) against
`question.correct_answer`. Full marks (from `question.marks`) on match, zero
otherwise — no partial credit, no AI involvement.

**Technical detail — open-ended and code scoring.** Both go through Ollama, scored
0–10 by the model and linearly rescaled to the question's actual `marks` value
(`_scale_score`). The prompts (`EvaluationPrompts.oe_eval_template`/`.code_eval_template`,
now resolved per model family via `app/prompts/`, see Section 1) supply the
question, rubric, and model answer, and instruct the model not to award 10/10
unless every rubric criterion is fully met. Code submissions get an extra
instruction to note (not penalize) suspected AI-generated code. Both return
`matched_criteria`/`missed_criteria` lists as structured per-question feedback. A
missing answer short-circuits to 0 marks without an Ollama call.

**Recommendation thresholds — verified against `evaluation_service._score_to_recommendation`:**

|Percentage|Recommendation|
|---|---|
|≥ 80%|`STRONG_HIRE`|
|65–79%|`HIRE`|
|45–64%|`MAYBE`|
|< 45%|`NO_HIRE`|

These thresholds are enforced twice: first as an instruction inside the aggregate
prompt (`EvaluationPrompts.agg_system` tells the model the exact recommendation it is
*required* to output), and second as a hard code-level guardrail
(`_enforce_recommendation`) that silently downgrades any recommendation more
optimistic than the score allows — the source comment notes this exists
specifically to stop "0% → HIRE hallucinations." The model's narrative judgment
never moves the recommendation tier; only the percentage does.

Evaluation level (a separate, descriptive proficiency label, not used for the hire
decision) is computed by `_compute_evaluation_level`: ≥85% `EXPERT`, ≥70%
`ADVANCED`, ≥50% `INTERMEDIATE`, else `BEGINNER`.

Every evaluation is persisted with `is_preliminary=True` — by design the admin
always makes the final hiring call; the AI recommendation is preliminary input.

---

## 5. AI Costs

**Business summary.** There is no cloud AI API bill to report for the core pipeline
— skill extraction, test generation, and evaluation all run against the self-hosted
Ollama instance, with zero external network calls and therefore zero marginal
per-call cost. The real costs are infrastructure (the GPU or CPU capacity to run the
model) and time (generation is a background job that can take several minutes
depending on hardware tier). There is no usage-based invoice to forecast; capacity
planning is a one-time hardware decision, not a recurring spend that scales with
hiring volume.

**Technical detail — time cost, by config.** `backend/app/config.py` sets
`ollama_timeout_seconds: int = 600` (10 minutes) as the default per-request budget,
and `ollama_max_retries: int = 3` for transport-level retries with exponential
backoff (2s/4s/8s) before surfacing `AIServiceError`. `start.sh` overrides the
per-request timeout per hardware profile, from 300s (`low`) up to 1200s
(`cpu_slow`) — a single generation call's worst-case wait window ranges from 5 to
20 minutes depending on hardware.

The ARQ worker's `job_timeout` (`backend/app/worker.py`, `_compute_job_timeout`)
covers the *entire* 3-test generation job, not one call:
`ollama_timeout_seconds × (1 + ollama_max_retries) × 3 + 120` seconds. On the
default `medium` profile (600s timeout, 3 retries) that's `600 × 4 × 3 + 120 =
7,320` seconds (≈2 hours) as the absolute worst-case ceiling — in practice
generation completes in the few-minutes range `start.sh` estimates per profile
(~1 minute per test on `ultra`, ~8 minutes per test on `cpu_fast`); the 2-hour
figure is only reached if every Ollama call across all retries times out.

No cloud API cost estimate is given because none applies — there is no code path
that calls an external LLM provider for extraction, generation, or evaluation.

---

## 6. Failure Cases

**Business summary.** The system is built so that AI failures are visible and
contained rather than silent or catastrophic. If the model can't produce a valid
response after several attempts, or if Ollama itself is down, the admin sees a clear
error state (a `FAILED` status on the job, or a structured error from the API) rather
than a corrupted or half-finished result silently appearing as if it succeeded. The
one exception, by design, is the embedding/similarity feature (Section 3), which is
explicitly allowed to fail invisibly because it is a nice-to-have, not part of the
grading pipeline.

**Technical detail — concrete failure modes, code-verified:**

1. **`AIResponseParseError` after retries exhausted.** Raised by all three pipelines
   (`extract_skills_from_jd_text`, `_generate_with_retry` in test generation,
   `_eval_one_open_ended`/`_eval_one_code`/`_aggregate_evaluation` in evaluation)
   once the correction-prompt loop completes without a Pydantic-valid response. Maps
   to HTTP 502 (`AI_PARSE_ERROR`). For the **analyze** (skill extraction) and
   **generate** (test generation) flows, the failure happens inside an ARQ
   background job — the admin sees it via the JD's `generation_status` flipping to
   `FAILED` (`jd_service.py`'s `except Exception` blocks for both
   `extract_skills_background` and `generate_tests_background`), polled by the
   frontend rather than returned synchronously. For the **evaluation trigger**,
   which runs synchronously, the route in `backend/app/api/v1/evaluation.py` catches
   `(AIServiceError, AIResponseParseError)` directly and returns a structured JSON
   body (`attempt_id`, `error_code`, `message`) with status 502 or 503 immediately
   as the HTTP response.

2. **`AIServiceError` on Ollama unreachable/timeout.** Raised by
   `OllamaClient._post_once` on `httpx.ConnectError` ("Cannot connect to Ollama...
   Is Ollama running?"), `httpx.TimeoutException` ("Ollama request timed out after
   Ns..."), or any non-2xx HTTP status (including 404: "Model 'X' not found in
   Ollama. Run: ollama pull X"). `_post_with_retry` retries transient failures up to
   `ollama_max_retries` times with backoff before giving up. Maps to HTTP 503
   (`AI_SERVICE_ERROR`) and surfaces the same way as above —
   `generation_status=FAILED` for the background pipelines, a direct 503 response
   for the synchronous evaluation trigger.

3. **Malformed JSON despite `format="json"` enforcement.** Ollama's JSON mode
   constrains sampling but doesn't guarantee schema conformance or prevent stray
   markdown fences. `parse_json_response` strips ` ```json ` fences, falls back to
   extracting the outermost `{...}` block via regex, then attempts `json.loads`. If
   that still fails it raises `AIResponseParseError` with the first 200 characters
   of the raw response attached — feeding the same correction-prompt retry loop
   described in Section 2 (a JSON-decode failure and a Pydantic validation failure
   both route through the same retry mechanism with different error text).

4. **Partial test generation — verified as all-or-nothing, not partial-persist.** As
   detailed in Section 2.2, `generate_tests_for_jd` checks
   `len(successful) < len(prompts)` and raises before any of the three tests are
   persisted, specifically to prevent a JD ending up with 2 of 3 tests while
   reporting `READY`. The admin-visible outcome of a partial failure is identical to
   a total failure: `generation_status = FAILED`, zero tests saved, and a log
   message naming which test type(s) failed.

5. **Embedding failures (the one intentionally silent case).** Every embedding
   failure mode returns `None`, logged only as a warning — never raised, never
   surfaced to the admin UI, never blocking evaluation persistence. This is the sole
   deliberate exception to "fail loudly" in the AI subsystem, scoped narrowly to one
   optional column on `evaluations`.
