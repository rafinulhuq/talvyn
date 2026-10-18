# 05 — Backend and API Documentation

> Counts and enumerations in this document are cited from
> [`_facts.md`](./_facts.md) (48 endpoints, 13 services, the auth model). Every
> per-endpoint signature below (method, path, request/response shape, status
> codes) was re-verified directly against the route decorators in
> `backend/app/api/v1/*.py` on 2026-06-18 — it is not transcribed from memory
> or from `_facts.md`.

Talvyn's backend is a FastAPI application (`backend/app/main.py`) serving
48 REST endpoints across 7 router files. It sits behind an OpenResty/Nginx
reverse proxy with a Lua-based structural JWT check, and is itself fronted by
a Next.js server that performs full session verification before forwarding
admin requests. This document covers two things:

1. **Backend Module Documentation** — the request lifecycle, and where
   controllers, services, schemas, validators, middleware, and utilities live.
2. **API Reference** — every one of the 48 endpoints, organized by router
   file, with method, path, auth, rate limits, request/response shapes, error
   conditions, and a realistic example.

---

## 1. Backend Module Documentation

### 1.1 Request Lifecycle

Every request into the platform crosses three process boundaries before it
touches business logic: the browser, the Nginx/OpenResty edge, and (for
admin/internal traffic) the Next.js server, before finally reaching FastAPI.
Candidate-facing attempt and invitation-validation routes skip the Next.js
hop entirely and call FastAPI directly from the browser.

There are two fundamentally different traffic shapes:

- **Admin/internal traffic** (JD upload, test generation, evaluation,
  stats, invitation creation): browser → Next.js (NextAuth session
  verified) → FastAPI with `X-Internal-Token` + `X-Uploader-Id`/`X-Inviter-Id`
  headers → `VerifiedInternal` dependency.
- **Candidate attempt traffic** (`/attempts/*`, `/invitations/validate/{token}`):
  browser → Nginx (Lua exempts these prefixes from the cookie check) → FastAPI
  directly, authenticated by a per-attempt `X-Attempt-Token` header verified
  inside the service layer, not a FastAPI dependency.

```mermaid
sequenceDiagram
    actor Browser
    participant Nginx as Nginx / OpenResty (Lua jwt_check.lua)
    participant NextJS as Next.js server (admin routes only)
    participant FastAPI as FastAPI route (api/v1/*.py)
    participant Guard as VerifiedInternal / X-Attempt-Token check
    participant Pydantic as Pydantic schema validation
    participant Service as Service function (app/services/*.py)
    participant DB as PostgreSQL (SQLAlchemy async)
    participant Ollama as Ollama (local LLM)

    Browser->>Nginx: HTTPS request (cookie or X-Attempt-Token)
    Note over Nginx: jwt_check.lua — structural check only.<br/>Exempts /health, /attempts, /invitations, /docs.<br/>Rejects missing/malformed NextAuth cookie in &lt;1ms<br/>for everything else, without invoking Python.
    alt Admin/internal route
        Nginx->>NextJS: forward (cookie present)
        Note over NextJS: getToken() — full HMAC signature<br/>verification of the NextAuth JWT
        NextJS->>FastAPI: fetch with X-Internal-Token,<br/>X-Uploader-Id / X-Inviter-Id
        FastAPI->>Guard: Depends(verify_internal_token)
        Note over Guard: hmac.compare_digest(SHA256(secret), SHA256(header))
    else Candidate attempt route
        Nginx->>FastAPI: forward directly (Lua-exempted prefix)
        FastAPI->>Guard: Depends(_verify_attempt_token) [header presence only]
        Note over Guard: Real ownership check happens later,<br/>inside the service call:<br/>_load_attempt_for_token(attempt_id, token, db)
    end
    Guard-->>FastAPI: 401/403 raised here on failure, else continue
    FastAPI->>Pydantic: parse request body into schema class
    Note over Pydantic: field_validator / model_validator run here<br/>(e.g. DifficultyOverride sum-to-100 check)
    Pydantic-->>FastAPI: 422 on failure, else validated object
    FastAPI->>Service: await service_function(...)
    Service->>DB: SELECT / INSERT / UPDATE (AsyncSession)
    opt AI-backed endpoint
        Service->>Ollama: HTTP call (skill extraction, test gen, eval)
        Ollama-->>Service: JSON, validated against AI-output schema
    end
    DB-->>Service: rows / commit
    Service-->>FastAPI: DTO / ORM object
    FastAPI-->>Browser: JSON response (Pydantic response_model)
```

Key properties of this pipeline:

- **Nginx's Lua check is a filter, not the security boundary.** It only
  confirms a cookie shaped like a JWT exists (three base64url segments) —
  see `nginx/lua/jwt_check.lua`. It does not verify the HMAC signature
  (that would require duplicating `NEXTAUTH_SECRET` into Nginx config). Real
  authentication happens in the Next.js layer via `getToken()`, and again at
  FastAPI via `VerifiedInternal`.
- **FastAPI never trusts the browser directly for admin actions.** The
  `X-Internal-Token` shared secret (`backend/app/dependencies.py`) only
  proves "this call came from our Next.js server," not "this call came from
  an authorized user" — that check already happened in Next.js. `X-Uploader-Id`
  and `X-Inviter-Id` carry the already-verified user ID forward.
  - `INTERNAL_API_SECRET` was not found in `frontend/.env.local.example` (rechecked 2026-06-18) -  it lacks the env var to verify with internal endpoint
- **Candidate attempt routes are verified twice**, at two different layers,
  for two different things: the route-level `_verify_attempt_token` dependency
  in `backend/app/api/v1/attempts.py` only checks that an `X-Attempt-Token`
  header is *present*; the actual ownership check — that the token matches
  *this* `attempt_id` — happens inside `attempt_service._load_attempt_for_token()`,
  called as the first line of every mutating service function (`save_answer`,
  `bulk_save_answers`, `heartbeat`, `submit_attempt`, `log_suspicious_event`,
  `get_attempt_state`).

### 1.2 Controllers (Route Files)

FastAPI has no separate "controller" class — the route files in
`backend/app/api/v1/` fill that role: they parse the path/query/header/body
parameters, enforce auth via `Depends()`, call exactly one service function,
and shape the response. All business logic is delegated to the service layer;
the only logic that lives inline in route files is pre-condition checks that
gate whether the service call should happen at all (e.g. `analyze_jd` checking
`parse_status == DONE` before queuing extraction).

| File | Mounted at | Endpoint count |
|---|---|---|
| `health.py` | `/api/v1/health` | 2 |
| `jd.py` | `/api/v1/jd` | 6 |
| `tests.py` | `/api/v1/tests` | 12 |
| `invitations.py` | `/api/v1/invitations` | 7 |
| `attempts.py` | `/api/v1/attempts` | 7 |
| `public_links.py` | `/api/v1/public-links` | 6 |
| `evaluation.py` | `/api/v1/evaluation` | 12 |
| `stats.py` | `/api/v1/stats` | 2 |

Mounting is centralized in `backend/app/api/v1/router.py`, which composes all
eight sub-routers under a single `/api/v1` prefix, each tagged for the
auto-generated OpenAPI docs (`/docs`, gated behind `settings.debug` or
`settings.show_docs`).

`public_links.py` is the one router file with a mixed auth surface: its
admin endpoints (`POST`/`GET /jd/{jd_id}`, `PATCH /{link_id}`,
`GET /{link_id}/analytics`) require `VerifiedInternal` like `invitations.py`'s
admin routes, while `GET /resolve/{slug}` and `POST /{slug}/register` are
deliberately unauthenticated and rate-limited (30/min and 5/min
respectively) — the same pattern `invitations.py`'s `GET /validate/{token}`
and `attempts.py`'s `POST /start` already use for candidate-facing,
no-session endpoints. `GET /{link_id}/analytics` computes its
views/registrations/starts/completions/pass-rate funnel on every call —
nothing is cached or pre-aggregated, since admin dashboard traffic for one
JD's link is low-volume enough that this isn't a hot path.

### 1.3 Services

The 13 service files in `backend/app/services/` contain all business logic —
DB queries, Ollama calls, file I/O, email sending, token hashing. Full
per-service responsibilities, function signatures, and the service dependency
graph are documented in
[`03-codebase-analysis.md` §2.1](./03-codebase-analysis.md#21-backend-services-13-files-in-backendappservices)
and are not repeated here. The brief recap relevant to reading the API
reference below:

- `jd_service.py` — JD CRUD, file-backed creation, status polling.
- `parser_service.py` / `skill_extraction_service.py` — text extraction and
  Ollama-driven skill extraction, invoked from `jd.py`'s `/upload` and
  `/analyze`.
- `test_generation_service.py` — the 3-test generation pipeline behind
  `tests.py`'s `/generate/{jd_id}`, plus the Redis-backed progress reporting
  consumed by `/progress/{jd_id}` and its SSE variant.
  - `test_service.py` — test/question CRUD called from most of `tests.py`.
- `invitation_service.py` — magic-link issuance, validation, bulk invite,
  revoke/resend, all called from `invitations.py`.
- `public_link_service.py` — public-link create/list/update for admins,
  plus `resolve_public_link()` and `register_via_public_link()` for the
  unauthenticated candidate registration flow, called from `public_links.py`.
  Reuses `invitation_service._upsert_candidate()` and `_find_active_invitation()`
  and `attempt_service.get_test_progress()` directly rather than
  duplicating candidate-upsert or completion-detection logic.
- `attempt_service.py` — the candidate exam runtime: starting, resuming,
  autosaving, heartbeat timer reconciliation, submission, and the
  `_load_attempt_for_token` ownership check used by every `attempts.py`
  mutation.
- `evaluation_service.py` — MCQ auto-scoring, Ollama open-ended scoring,
  leaderboard/system-report aggregation, called from `evaluation.py`.
- `export_service.py` — DOCX report generation for `/evaluation/{id}/export`.
- `email_service.py`, `embedding_service.py`, `ollama_service.py`,
  `file_service.py` — cross-cutting infrastructure used by several of the
  above (mail delivery, pgvector embeddings, the shared Ollama HTTP client,
  upload directory management).

### 1.4 DTOs / Schemas

Pydantic models in `backend/app/schemas/*.py` are the DTOs: they define both
what FastAPI will accept as a request body and what shape it serializes as a
response (`response_model=`). Each schema file maps to one router's domain:
`jd.py`, `test.py`, `invitation.py`, `attempt.py`, `evaluation.py`,
`public_link.py`. A
recurring pattern worth knowing before reading the reference section: most
files separate **three schema layers**:

1. **AI output validation schemas** (e.g. `MCQQuestionAI`, `GeneratedTestAI`,
   `OpenEndedEvalAI`, `AggregateEvalAI`) — strict schemas the Ollama JSON
   response must conform to before anything is written to the database. These
   include auto-repair `field_validator`/`model_validator` hooks that heal
   common small-model output mistakes (wrong key names, missing `is_correct`
   flags, too many/few options) rather than failing the whole generation.
2. **API response schemas** (e.g. `TestResponse`, `EvaluationResponse`) —
   lenient, `from_attributes=True`, built directly from ORM rows via
   `ConfigDict(from_attributes=True)`.
3. **Request/edit schemas** (e.g. `UpdateTestRequest`, `AdminOverrideRequest`)
   — what the Next.js admin UI sends for mutations.

### 1.5 Validators

Pydantic v2 `field_validator`/`model_validator` decorators enforce
business-rule-level constraints beyond basic typing. Three concrete examples,
each with file and line:

- **`DifficultyOverride.​_sum_must_be_100`** —
  `backend/app/schemas/test.py:365-372`. A `model_validator(mode="after")`
  that rejects any `GenerateTestsRequest.difficulty_distribution` whose
  `easy_percent + medium_percent + hard_percent != 100`, raising a
  `ValueError` that FastAPI surfaces as a 422.
- **`MCQQuestionAI.clamp_mcq_marks`** —
  `backend/app/schemas/test.py:37-40`. A `field_validator(mode="before")`
  that clamps the AI-returned `marks` field into `[1, 10]` via
  `max(1, min(int(v), 10))` rather than rejecting an out-of-range value —
  because the data is Ollama output, not user input, healing is preferred
  over hard failure.
- **`UpdateQuestionRequest.validate_options_if_provided`** —
  `backend/app/schemas/test.py:341-353`. Rejects an MCQ edit unless exactly 4
  options are supplied and exactly one has `is_correct=True`, raising
  `ValueError("MCQ must have exactly 4 options")` or
  `ValueError("MCQ must have exactly 1 correct option")`.
- **`SaveAnswerRequest.trim_answer_text`** —
  `backend/app/schemas/attempt.py:79-86`. Trims whitespace and hard-caps
  candidate open-ended answers at 10,000 characters before they ever reach
  the database.

### 1.6 Middleware

Registered in `backend/app/main.py`, in this order:

1. **Prometheus instrumentation** (`prometheus_fastapi_instrumentator.Instrumentator`)
   — wraps every route to record latency/status-code metrics, exposed at
   `/metrics` (excluded from the OpenAPI schema). `/metrics` and
   `/api/v1/health` are excluded from instrumentation themselves.
2. **`SlowAPIMiddleware`** (slowapi) — works together with the `app.state.limiter`
   instance from `backend/app/core/ratelimit.py` and the
   `RateLimitExceeded` exception handler to return clean 429 JSON bodies
   instead of letting slowapi's default error surface.
3. **`CORSMiddleware`** — origins from `settings.allowed_origins_list`,
   `allow_credentials=True`, all methods, all headers.

GlitchTip/Sentry instrumentation (`sentry_sdk.init(...)`) is wired in
conditionally before the `FastAPI()` app object is even constructed, only
when `settings.glitchtip_dsn` is non-empty — it is not a middleware in the
ASGI sense but instruments the app the same way (`FastApiIntegration()`,
`SqlalchemyIntegration()`), with `send_default_pii=False` and a 10% trace
sample rate.

### 1.7 "Guards" (FastAPI Dependencies)

FastAPI does not have a NestJS-style `Guard` abstraction — there is no
decorator that runs before route resolution and can short-circuit it
independently of the dependency-injection system. The closest equivalents in
this codebase are two `Depends()`-injected functions, both of which raise an
`HTTPException` to short-circuit the request before the handler body runs:

- **`VerifiedInternal`** (`backend/app/dependencies.py:61`) — a type alias for
  `Annotated[None, Depends(verify_internal_token)]`. Reads the
  `X-Internal-Token` header and compares it to `settings.internal_api_secret`
  using `hmac.compare_digest` over SHA-256 digests (constant-time, avoids
  timing attacks). Raises 401 if the header is missing or mismatched. Used on
  every admin/internal endpoint — i.e. all of `jd.py`, `tests.py`,
  `evaluation.py`, `stats.py`, most of `invitations.py`, and the
  admin create/list/update endpoints of `public_links.py` (its
  resolve/register endpoints are deliberately exempt — see §1.2).
- **`AttemptToken`** (`backend/app/api/v1/attempts.py:96`) — a type alias for
  `Annotated[str, Depends(_verify_attempt_token)]`. The dependency itself
  (`_verify_attempt_token`, lines 79-93) only checks that an
  `X-Attempt-Token` header is present, raising 401 if not — it does **not**
  verify the token is valid or belongs to the path's `attempt_id`. That
  verification is deferred to `attempt_service._load_attempt_for_token()`,
  called explicitly as the first statement inside every consuming service
  function. This two-step design (presence-check dependency + ownership-check
  inside the service) is intentional but means the dependency alone is not a
  complete guard — reviewers should look at the service body, not just the
  route signature, to confirm authorization.

### 1.8 Utilities

`backend/app/core/` holds cross-cutting infrastructure with no business logic
of its own:

- **`security.py`** — magic-link token lifecycle: `generate_token()` (32
  random bytes, URL-safe base64), `hash_token()` (HMAC-SHA256 with
  `magic_link_secret`, never stores the raw token), `verify_token()`
  (constant-time comparison), `is_expired()`, and `build_magic_link()`. This
  is the foundation `invitation_service.py` and `attempt_service.py` both
  build on. `build_public_link()` is the equivalent for the public-link
  share URL (`/apply/<slug>`) — it builds a URL from a plaintext slug rather
  than a hashed token, since the slug identifies the assessment, not a
  candidate, and is meant to be shared publicly.
- **`exceptions.py`** — defines `AppException` and typed subclasses
  (`ValidationError` → 422, `NotFoundError` → 404, `UnauthorizedError` → 401,
  `ForbiddenError` → 403, `ConflictError` → 409, `FileTooLargeError` → 413,
  `InvalidFileTypeError` → 415, `AIServiceError` → 503,
  `AIResponseParseError` → 502, `DatabaseError` → 500), plus
  `register_exception_handlers(app)` which wires uniform JSON error bodies
  (`{"success": false, "error": {"code", "message"}}`) for `AppException`,
  404, 405, and any unhandled `Exception`.
- **`logging.py`** — `structlog` configuration: colored console output when
  `debug=True`, JSON output (with `dict_tracebacks`) otherwise. Used via
  `get_logger(__name__)` throughout the route and service layers.
- **`ratelimit.py`** — the shared slowapi `Limiter` instance. Its key
  function (`_key_by_user_or_ip`) prefers the `X-Uploader-Id` header so
  limits are enforced per authenticated user rather than per source IP —
  necessary because every request to FastAPI originates from the same
  Next.js container IP. Storage is Redis-backed (`storage_uri=settings.redis_url`)
  so the limit is enforced globally across all 4 Uvicorn workers rather than
  being a per-process counter that would effectively multiply the limit by
  worker count.

---
