# 11. Security Audit

**Audit date:** 2026-06-18
**Scope:** Talvyn monorepo — `backend/` (FastAPI/SQLAlchemy/PostgreSQL), `frontend/` (Next.js/NextAuth/Prisma), deployment configuration (`docker-compose*.yml`, `nginx/`).
**Method:** Direct re-verification against the current codebase (commit history through `3950ab9`, working tree clean). Every finding below was confirmed by reading the cited file and line at the time of writing.
**Posture note on a prior audit:** An earlier third-party review, `codex-audit/Talvyn-full-project-audit.md` (dated 2026-06-14), listed several P0 findings. Five were independently re-checked on 2026-06-18 (see `docs/enterprise/_facts.md` §12) and found **false or already remediated**: candidate-attempt token-ownership bypass, token duplicated in the query string, tracked `.env`/secret files, production migrations bypassed, and non-durable AI background jobs. This audit does not repeat those. One claim — tracked virtualenv artifacts — was re-verified **true in a corrected form** (S-1 below: `backend/.venv_test`, not `backend/.venv`). All findings below were re-derived from current code, independent of that document's conclusions.

---

## Severity Legend

| Severity | Definition |
|---|---|
| **Critical** | Remotely exploitable, no auth required, leads to data breach, full compromise, or credential theft at scale. |
| **High** | Exploitable with some precondition (valid session, leaked token, specific timing) and has material impact on confidentiality/integrity/availability. |
| **Medium** | Real weakness with limited blast radius, requires a specific scenario to matter, or is a defense-in-depth gap rather than an active hole. |
| **Low** | Theoretical or low-impact issue; best-practice deviation that is unlikely to be independently exploitable. |
| **Informational** | Worth tracking/documenting; not a vulnerability in itself. |

## Summary Table

| ID | Finding | Severity | Status |
|---|---|---|---|
| S-1 | `backend/.venv_test` (4,156 files) tracked in git | Low | Open — hygiene, not a leak |
| S-2 | Hardcoded default admin password in seed script | Medium | Open — bootstrap-only, by design |
| S-3 | Candidate token present in URL path segment | Informational | Open — inherent to magic-link UX, lower risk than query-string exposure |
| S-4 | Three divergent production deployment topologies | Low | Open — operational confusion, not a vulnerability |
| S-5 | No Content-Security-Policy or HSTS header configured | Medium | Open |
| S-6 | NextAuth cookie hardening relies entirely on framework defaults | Low | Open |
| S-7 | `next-auth` pinned to legacy v4 line | Informational | Open |
| S-8 | No automated dependency/CVE scanning observed in CI | Informational | Open — this audit performed no live scan either |
| G-1 | HMAC-SHA256 + constant-time comparison (magic links and internal API secret) | — | **Confirmed good control** |
| G-2 | `_load_attempt_for_token` guard on every candidate mutation | — | **Confirmed good control** |
| G-3 | bcrypt(12) for admin passwords | — | **Confirmed good control** |
| G-4 | Pydantic + Zod validation coverage | — | **Confirmed good control** |
| G-5 | `.env` files properly gitignored | — | **Confirmed good control** |
| G-6 | Redis-backed rate limiting across workers | — | **Confirmed good control** |
| G-7 | Parameterized raw SQL (PL/pgSQL + pgvector queries) | — | **Confirmed good control** |
| G-8 | Scoped, non-wildcard CORS configuration | — | **Confirmed good control** |

---

## Confirmed Good Controls

These were independently verified, not assumed, and are stated as strengths because the underlying implementation choices are correct, not merely because no problem was found.

### G-1. HMAC-SHA256 with constant-time comparison, used consistently for both secrets in the system

`backend/app/core/security.py` implements magic-link token handling correctly end to end:

- Tokens are generated with `secrets.token_urlsafe(32)` (`security.py:46`) — 256 bits of CSPRNG entropy, never derived from predictable input.
- Raw tokens are never persisted. Only `hash_token()` output (HMAC-SHA256 keyed with `settings.magic_link_secret`, `security.py:49-68`) is stored as `invitations.token_hash`.
- Verification (`security.py:71-85`) recomputes the HMAC and compares with `hmac.compare_digest(computed, stored_hash)` — a constant-time comparison that prevents timing side-channel attacks on the hash value.

The same pattern is independently applied to the second secret in the system — the internal API trust boundary between the Next.js proxy and FastAPI. `backend/app/dependencies.py:46-52` (function `verify_internal_token`) compares the expected and provided `X-Internal-Token` values via:

```python
expected = settings.internal_api_secret.encode()
provided = x_internal_token.encode()
if not hmac.compare_digest(
    hashlib.sha256(expected).digest(),
    hashlib.sha256(provided).digest(),
):
```

This hashes both sides before comparison and uses `hmac.compare_digest`, not Python's `==`. Two independent secret-verification paths both avoid the classic timing-attack pitfall — a deliberate, consistent pattern, not an accident.

### G-2. Object-level authorization is enforced on every candidate attempt mutation

This is the corrected, current status of what the prior third-party audit flagged as its top P0. Re-reading `backend/app/services/attempt_service.py` line by line confirms the guard is present and is the *first* operation in every mutating function, before any other DB access or business logic:

| Function | Line | Call |
|---|---|---|
| `get_attempt_state` | 402 | `attempt = await _load_attempt_for_token(attempt_id, token, db)` |
| `save_answer` | 446 | `attempt = await _load_attempt_for_token(attempt_id, token, db)` |
| `bulk_save_answers` | 484 | `attempt = await _load_attempt_for_token(attempt_id, token, db)` |
| `heartbeat` | 587 | `attempt = await _load_attempt_for_token(attempt_id, token, db)` |
| `submit_attempt` | 656 | `attempt = await _load_attempt_for_token(attempt_id, token, db)` |
| `log_suspicious_event` | 743 | `attempt = await _load_attempt_for_token(attempt_id, token, db)` |

`_load_attempt_for_token` (`attempt_service.py:783-801`) loads the attempt and its parent invitation, rejecting with HTTP 403 unless `verify_token(token, invitation.token_hash)` succeeds — cryptographically binding the token to that specific attempt's invitation. A candidate holding a valid token for attempt A cannot use it on attempt B; the HMAC only succeeds against its own invitation's `token_hash`. This closes the broken-object-level-authorization gap a "presence only" check would leave open, applied uniformly across all six routes.

### G-3. Admin passwords are bcrypt-hashed at cost factor 12, never stored or logged in plaintext

`frontend/prisma/seed.ts:22`: `const passwordHash = await bcrypt.hash(admin.password, 12);` using `bcryptjs`. Cost factor 12 is within current OWASP guidance for bcrypt (≥10, commonly 12 recommended). The hash, not the raw string, is passed to `prisma.user.create` (`seed.ts:23-30`). The script's only `console.log` calls (`seed.ts:19, 31`) print the admin email and user ID, never the password. Login verification (`frontend/src/lib/auth.ts:59`) uses `bcrypt.compare`, and the codebase additionally performs a dummy `bcrypt.compare` against a hardcoded hash when no matching user is found (`auth.ts:54-55`) — a deliberate constant-time defense against user-enumeration via login-latency timing. See S-2 for the separate question of whether the *default* password value itself is a residual risk.

### G-4. Pydantic and Zod validation are both used as the primary input-validation layer

Spot-checked three backend schema files and three frontend form/auth schemas; all request-shaped data is validated through a typed schema rather than a raw dict/`any`:

- `backend/app/schemas/attempt.py` — `StartAttemptRequest` and friends extend Pydantic `BaseModel`, with `Field(min_length=10)`-style constraints and a `field_validator` that trims/caps `answer_text` (lines 79-86).
- `backend/app/schemas/jd.py` — all request/response models extend `BaseModel` with `ConfigDict`.
- `backend/app/schemas/invitation.py` — `CreateInvitationRequest` uses Pydantic's `EmailStr` type for email validation plus `Field(min_length=1, max_length=255)`; `BulkInviteRequest.candidates` is bounded to `Field(min_length=1, max_length=50)` (line 127), also acting as an anti-abuse cap on bulk-invite batch size.
- `frontend/src/lib/auth.ts:18-21` — `loginSchema = z.object({ email: z.string().email(...), password: z.string().min(8, ...) })`, enforced via `loginSchema.safeParse(credentials)` inside NextAuth's `authorize` callback (server-side, not just UI).
- `frontend/src/components/admin/InviteForm.tsx:25-36` — Zod schema with length bounds, email format, and lowercase normalization.

Consistent with the project's claim of near-total schema-validated request handling; the spot-check did not surface unvalidated input.

### G-5. `.env` and hardware-config files are correctly excluded from version control

Running `git ls-files | grep -E "\.env$|\.env\."` from the repo root returns only:

```
.env.example
backend/.env.example
frontend/.env.local.example
```

No real `.env`, `backend/.env.hardware`, or `frontend/.env`/`.env.local` is tracked, matching `.gitignore` entries at the root and in `backend/.gitignore`. This directly contradicts the prior third-party audit's "tracked environment files" P0 claim, which does not hold against the current tree.

### G-6. Rate limiting is Redis-backed, correct for a multi-worker deployment

`backend/app/core/ratelimit.py:42-45` configures slowapi's `Limiter` with `storage_uri=get_settings().redis_url` rather than the in-memory default — a deliberate choice, called out in an adjacent comment, to keep counters consistent across all 4 uvicorn workers (an in-memory limiter would let each worker count independently, quadrupling the effective limit). Wired into the app via `app.state.limiter` and `SlowAPIMiddleware` in `backend/app/main.py:202-204`. All four documented rate-limited endpoints were confirmed present at their stated limits: `POST /jd/upload` 10/min (`jd.py:62`), `POST /jd/{jd_id}/analyze` 5/min (`jd.py:233`), `POST /tests/generate/{jd_id}` 3/min (`tests.py:58`), `POST /evaluation/trigger` 5/min (`evaluation.py:81`).

### G-7. Raw SQL is parameterized correctly in both places it's used

`backend/app/services/evaluation_service.py` contains one raw-SQL `text()` call, the pgvector similarity query (lines 779-797): `db.execute(text("..."), {"emb": emb_literal, "attempt_id": attempt_id, "limit": limit})`. The `:emb`/`:attempt_id`/`:limit` placeholders are SQLAlchemy bound parameters, not string-interpolated. `emb_literal` is built from `evaluation.embedding` floats (generated server-side, never user-supplied) and is still passed as a bound value. The second raw-SQL call, invoking the `calculate_evaluation_scores` PL/pgSQL function, actually lives in the router `backend/app/api/v1/evaluation.py:350-354`: `db.execute(text("SELECT * FROM calculate_evaluation_scores(:aid)"), {"aid": attempt_id})`. `attempt_id` is path-supplied (user-controlled) but bound, not interpolated. Neither call is susceptible to SQL injection — the two sites split across `evaluation_service.py` and `evaluation.py`, not both in the service file.

### G-8. CORS is scoped to explicit origins, not a permissive wildcard

`backend/app/config.py:49` defines `allowed_origins: str = "http://localhost:3000,http://localhost:3001"`, parsed into a list by `allowed_origins_list` (lines 52-53) and passed into `CORSMiddleware` alongside `allow_credentials=True` (`backend/app/main.py:209-212`). Every override found in the repo (`docker-compose.yml:88`, `backend/.env.example:22`) supplies concrete origin strings — `*` never appears as a value for `ALLOWED_ORIGINS`. Combining `allow_credentials=True` with a wildcard origin is a well-known CORS misconfiguration; Talvyn does not have this problem.

---

## Findings

### S-1. `backend/.venv_test` — 4,156 files tracked in git (repo hygiene, not a secret leak)

| | |
|---|---|
| **Severity** | Low |
| **Evidence** | `git ls-files backend/.venv_test \| wc -l` → 4156. `backend/.gitignore` excludes the literal pattern `.venv/` (line 2) but this does not match the differently-named `.venv_test/` directory, so it was never excluded and has been committed across multiple historical commits (including `c25c4ac`, `e85d5b5`). |
| **Impact** | A committed Python virtualenv balloons repository size, slows clones/CI checkouts, creates noisy diffs on any dependency change, and risks platform-specific binary artifacts breaking across OS/architecture. |
| **Secret-leak check** | Targeted scan for real credential patterns (AWS-style `AKIA...` keys, `sk-`/`ghp_`/`xox`-style tokens, `.netrc`/`pip.conf`/private-key files) inside the tracked `.venv_test` tree returned **zero matches**. Broader keyword greps for `secret`/`password`/`token`/`api_key` returned only generic vocabulary inside vendored package source (e.g. SQLAlchemy's own docstring example `postgresql+psycopg2://user:password@host:port/dbname`) and the standard public `certifi` CA bundle. **No actual secrets were found inside the tracked venv files — this is a repository-hygiene issue, not a credential leak.** |
| **Recommendation** | `git rm -r --cached backend/.venv_test`, add `.venv_test/` to `backend/.gitignore`, and squash/filter history before external sharing if bloat itself is a concern (not a security issue requiring rotation). |

### S-2. Hardcoded default admin password in seed script

| | |
|---|---|
| **Severity** | Medium (bootstrap-only) |
| **Evidence** | `frontend/prisma/seed.ts:10` sets a known default password (`acmeai@r2026p#`) for the seeded admin account `acmeai@Talvyn.com` (line 8). It is hashed with `bcrypt.hash(admin.password, 12)` (line 22) **before** the `prisma.user.create` call — the database only ever stores the bcrypt digest, never the plaintext. The plaintext string exists only transiently in the in-memory `SEED_ADMINS` array and is not logged (the script's only `console.log` calls print email/user-id, never the password). |
| **Impact** | Not a stored-plaintext-credential issue or a leak — it is a known, documented bootstrap default so a freshly deployed instance has a usable admin account. The risk is operational: if an operator deploys to production and never rotates this password, anyone who has read the seed script can log in as admin. This is a standard pattern for first-run bootstrap credentials, but stays low-risk only if rotation is enforced or prominently mandated. |
| **Recommendation** | Confirm docs instruct operators to rotate this password immediately after first deploy (no forced password-change-on-first-login flow was found in the app itself — only documentation can currently enforce rotation). Consider generating a random password per deployment instead of a fixed literal, removing the "known default" risk entirely. |

### S-3. Candidate magic-link token appears in the URL path segment

| | |
|---|---|
| **Severity** | Informational |
| **Evidence** | The candidate flow's route is `frontend/src/app/test/[token]/page.tsx`, so the raw token is necessarily part of the path (`page.tsx:17-18,38`, `const { token } = await params`) — the normal/expected shape of a magic-link product. Independently re-reading `StartTestButton.tsx:43` and `exam/page.tsx:44-49` confirms the token is **not** additionally duplicated into the query string — `router.push(\`/test/${token}/exam?attempt=${attempt.attempt_id}\`)` places only the non-secret `attempt_id` in the query string; the token flows from the route segment into application state and is sent to the backend exclusively via the `X-Attempt-Token` header (`frontend/src/lib/api/attempts.ts:32-34`), never re-appended to any URL. This directly contradicts the prior audit's claim that the token is "duplicated in the query string" — that does not hold against current code. |
| **Impact** | A token in the URL *path* still has real, if reduced, exposure: browser history, server access logs (most web servers log the full request path), Referer headers, and session-replay/analytics tooling that records full URLs. Query-string exposure is strictly worse (more commonly logged by default, more visible in copy-pasted URLs with multiple params), so the current implementation is a meaningful improvement. It is not risk-free — anyone with access to access logs or browser history on a shared machine could recover a live token during its validity window. |
| **Recommendation** | If feasible, redeem the path-segment token once into a short-lived, opaque session identifier immediately on first load, avoiding re-display of the raw token in the address bar thereafter. A hardening step, not a fix for an active vulnerability. |

### S-4. Three divergent descriptions of the production deployment topology

| | |
|---|---|
| **Severity** | Low (operational confusion, not a vulnerability) |
| **Evidence** | `docker-compose.yml` (14 services, containerized OpenResty+Lua JWT guard on host port 81), `docker-compose.prod.yml` (3 services, expects a separate host-level nginx on 80/443, per `docs/deployment.md`), and `deploy-ngrok.sh` (dev stack plus a standalone nginx on 8080 fronted by ngrok) describe three different ways to run the system in production, and they are not reconcilable as written — `docs/deployment.md` documents only the second model. Full detail in `docs/enterprise/_facts.md` §13. |
| **Impact** | A documentation/operational-consistency risk, not an exploitable flaw on its own — but drift of this kind is the condition under which security controls quietly diverge between "documented" and "actually running" (one topology has a Lua JWT guard in front of the API, another doesn't describe an equivalent). A precondition that could mask a future gap, not a gap itself. |
| **Recommendation** | See `docs/enterprise/09-devops-documentation.md` for the full three-way comparison and resolution options; not re-litigated here. |

### S-5. No Content-Security-Policy or HSTS header configured

| | |
|---|---|
| **Severity** | Medium |
| **Evidence** | `frontend/next.config.ts:6-30` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` disabling camera/microphone/geolocation. There is no `Content-Security-Policy` header and no `Strict-Transport-Security` header anywhere in this file or elsewhere in the frontend config. |
| **Impact** | Without a CSP, the app has no defense-in-depth layer against injected/inline script execution if an XSS vector is ever introduced (React's default escaping mitigates most XSS, but CSP is the standard second layer — relevant given the app renders candidate free-text answers and AI-generated content in the admin UI). Without HSTS, a user reaching the site over plain HTTP even once is exposed to SSL-stripping/downgrade attacks, since the browser has no standing instruction to force HTTPS. |
| **Recommendation** | Add a `Content-Security-Policy` (start strict, loosen only as needed for Sentry/analytics) and a `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` header (once HTTPS is confirmed stable — premature `preload` can be hard to undo). Both can extend the existing `headers()` array in `next.config.ts`. |

### S-6. NextAuth cookie hardening relies entirely on framework defaults

| | |
|---|---|
| **Severity** | Low |
| **Evidence** | `frontend/src/lib/auth.ts` has no `cookies: {...}` block (grep-confirmed). Session strategy is JWT with an 8-hour `maxAge` (lines 76-79). Cookie attributes (`httpOnly`, `sameSite`, `secure`) come entirely from NextAuth v4's built-in defaults — reasonable (`httpOnly: true`, `sameSite: "lax"`, `secure` auto-enabled when `NEXTAUTH_URL` is `https://`) but implicit rather than pinned in code. |
| **Impact** | Low — defaults are sound for this app's threat model. The risk is that a future dependency upgrade or misconfigured `NEXTAUTH_URL` could silently change cookie behavior without anyone noticing, since nothing in the codebase asserts the intended behavior explicitly. |
| **Recommendation** | Add an explicit `cookies` block in `auth.ts` pinning `httpOnly: true`, `sameSite: "lax"`, `secure: true` for non-development environments. |

### S-7. `next-auth` pinned to the legacy v4 line

| | |
|---|---|
| **Severity** | Informational |
| **Evidence** | `frontend/package.json`: `"next-auth": "^4.24.11"` alongside `"next": "15.1.3"` and `"react": "19.0.0"`. NextAuth v4 is the pre-Auth.js-rebrand major version; v5 (Auth.js) is the actively developed line for Next.js App Router projects. |
| **Impact** | No active vulnerability — v4.24.x still receives security patches — but the project is on a major version that is not where new hardening defaults land first. A forward-looking maintenance note, not a current exploitable gap. |
| **Recommendation** | Track NextAuth/Auth.js v5 migration as a planned maintenance item. |

### S-8. No automated dependency/CVE scanning observed; this audit performed none either

| | |
|---|---|
| **Severity** | Informational |
| **Evidence** | `.github/workflows/ci.yml` runs `backend-tests` (pytest against in-memory SQLite) and `frontend-checks` (lint/type-check/build) — no `pip-audit`, `npm audit`, Dependabot/Renovate config, or Snyk/Trivy step found anywhere. `backend/requirements.txt` pins versions (e.g. `fastapi==0.115.6`, `sqlalchemy[asyncio]==2.0.36`, `pydantic==2.10.3`) recent as of early-to-mid 2025; `frontend/package.json` is on current-generation `next@15.1.3`/`react@19.0.0`. Nothing is conspicuously ancient or abandoned-looking from a version-number skim alone. |
| **Impact** | This audit explicitly did **not** run a live CVE scanner (`pip-audit`, `npm audit`, Snyk, Trivy, OSV-Scanner) against the pinned versions — stating otherwise would overstate this review's coverage. A version-number skim is not a substitute for an actual vulnerability database lookup. |
| **Recommendation** | Add `pip-audit` and `npm audit --audit-level=high` (or Dependabot/Renovate + GitHub's dependency-review-action) as CI gates for continuous, automatic dependency-risk checking. |

---

## Closing Notes for Reviewers

The most consequential finding in this audit is arguably **what did not hold up**: five separate P0 claims from the prior third-party review collapsed under direct re-verification against current code (broken object-level authorization, token-in-query-string, tracked secrets, skipped production migrations, non-durable AI jobs). That prior audit was dated four days before this one; the gap is most likely explained by remediation work landing between reviews, not fabrication — but it is a reminder that any audit, including this one, is a snapshot, and stale findings should never be carried into compliance or board-level material without a fresh line-by-line check against the code as it exists *today*. The one item that did carry forward (`backend/.venv_test`) only survived because it was independently re-confirmed via `git ls-files`, not assumed.

Nothing in this audit rises to **Critical** or unconfirmed **High** severity. The two **Medium** findings (S-2 hardcoded bootstrap admin password, S-5 missing CSP/HSTS) are standard, well-understood gaps with low-effort remediations, not architectural problems. The system's core trust boundaries — magic-link token verification, internal-API-secret verification, candidate-attempt object-level authorization, and raw-SQL parameterization — are all implemented with correct primitives (HMAC + constant-time comparison, per-attempt token binding, bound SQL parameters) rather than the common failure modes (plain `==`, presence-only token checks, string-interpolated SQL) that audits like this one exist to catch.
