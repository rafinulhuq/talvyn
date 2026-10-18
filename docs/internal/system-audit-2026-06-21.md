# Talvyn System Audit - 2026-06-21

This audit reviews the current Talvyn web app as a product and system:
backend, frontend, candidate flow, admin dashboard, security posture,
deployment, CI, dependencies, data ownership, and UX readiness.

The audit is based on current repository code, not older stale audit notes.
It now includes the first remediation pass completed on 2026-06-21.

## Executive Summary

Talvyn is a strong internal/self-hosted assessment platform with a solid
backend test suite, working Next.js build, HMAC-protected candidate tokens,
Redis-backed shared state, ARQ background jobs for AI work, Alembic migrations,
and useful admin/candidate workflows.

No active Critical/P0 issue was found in the core candidate-attempt security
model. Important older risks such as broken attempt-token ownership, stored raw
magic tokens, skipped production migrations, and non-durable AI jobs appear
fixed in the current codebase.

However, the app is not yet production-hard by enterprise/SaaS standards. The
main remaining issues are dependency CVEs, split database schema authority,
known bootstrap admin credentials, broad admin authorization, missing E2E
tests, and several UI/UX/compliance gaps.

## Recheck And Remediation - 2026-06-21

This recheck was run against the latest working tree after the recent logic
updates. The verification commands below were re-run during the recheck, and
the main findings were spot-checked directly against the current code.

Three findings were remediated in this pass: A-01 proxy-aware rate-limit
keying, A-02 candidate-facing test cache invalidation, and A-08 webhook URL
validation. The older issues that were already marked as fixed still remain
fixed: raw invitation tokens are HMAC-hashed at rest, candidate answer
mutations validate question ownership against the assigned test, production
startup runs Alembic migrations, AI generation work is persisted through
Redis/ARQ, and the frontend still passes type-check/build.

Rechecked status highlights:

| Area | Current recheck status |
| --- | --- |
| Candidate/public rate limiting | Fixed. Public/candidate proxies forward a sanitized client IP plus internal proxy proof; the backend trusts it only when the internal token matches. |
| Test cache freshness | Fixed. Test mutation and regeneration paths invalidate `test:{id}` and `approved_tests:{jd_id}` cache entries. |
| Dependency risk | Still open. `npm audit` still reports 26 vulnerabilities; `pip-audit` still reports 10 vulnerabilities in 3 packages. |
| Schema ownership | Still open. Prisma schema is still behind the Alembic/SQLAlchemy model surface. |
| Auth/RBAC/admin proxy | Still open. Backend routes still mostly rely on the shared internal token rather than role/resource checks, and the authenticated proxy is still catch-all. |
| Webhook URL safety | Fixed. Create-webhook requests now reject non-HTTPS, localhost, private IP, local/internal suffix, and credential-bearing URLs. |
| Magic-link URL exposure | Still open as a design risk. The token is still in the path during the exam route, though it is not duplicated in the query string. |
| CI/testing gaps | Still open. Backend tests pass, but backend test lint still fails, frontend lint remains warning-only, and no browser E2E suite is present. |
| Deployment/docs drift | Still open. Nginx and docs still disagree between port 80 and port 81 in several places. |
| Product/compliance gaps | Still open. I did not find new implementation that closes mobile/accessibility QA, proctoring false positives, coding sandbox, collaboration workflow, or formal compliance readiness. |

## Verification Run

| Check | Result |
| --- | --- |
| `backend/.venv_test/bin/pytest backend/tests -q` | Passed: 297 tests, 18 warnings |
| `backend/.venv_test/bin/ruff check backend/app` | Passed |
| `backend/.venv_test/bin/ruff check backend/app backend/tests` | Failed: 36 test-suite Ruff issues |
| `backend/.venv_test/bin/ruff check backend/app backend/tests/test_ratelimit.py backend/tests/test_test_cache_invalidation.py backend/tests/test_webhooks.py` | Passed |
| `npm run type-check` in `frontend/` | Passed |
| `npm run build` in `frontend/` | Passed; build skips lint by config |
| `npm run lint` in `frontend/` | Passed with 62 warnings |
| `npm audit --audit-level=moderate` in `frontend/` | Failed: 26 vulnerabilities, 2 high |
| `npm outdated` in `frontend/` | Many major upgrades available |
| `backend/.venv_test/bin/pip-audit -r backend/requirements.txt` | Failed: 10 known vulnerabilities in 3 packages |
| `backend/.venv_test/bin/python -m pip list --outdated` | Many backend packages behind current releases |
| `cargo test` in `frontend/wasm-parser` | Passed but ran 0 tests |
| `docker compose config --quiet` | Passed |
| tracked secret/env check | Real `.env` files are ignored, not tracked |

## Highest Priority Findings

### A-01. Candidate/public rate limiting collapses behind the Next.js proxies

Severity: High  
Area: availability, candidate experience, public links
Status: Fixed 2026-06-21

The original issue was that the backend rate limiter keyed admin calls by
`X-Uploader-Id` but fell back to the request socket IP for public and candidate
calls. Behind the Next.js proxy, that meant many candidates could share the same
FastAPI source IP.

Fix landed:

- Public and candidate proxies now forward `X-Talvyn-Client-IP` plus
  `X-Internal-Token`; the backend trusts that forwarded IP only when the
  internal token matches.
- Candidate-supplied `X-Attempt-Token` no longer overrides the rate-limit key,
  because rate limiting runs before token validation.
- Direct backend calls still fall back to the socket IP.
- Regression tests cover user-id, ignored candidate-token, trusted
  forwarded-IP, and untrusted forwarded-IP key selection.

Evidence:

- `backend/app/core/ratelimit.py` now has user, trusted-proxy-IP, and socket-IP
  branches.
- `frontend/src/app/api/candidate/[...path]/route.ts` and
  `frontend/src/app/api/public/[...path]/route.ts` now forward proxy proof and
  sanitized client IP data.
- `backend/tests/test_ratelimit.py` covers the new key-selection behavior.

Impact:

- The shared-bucket failure mode is closed for candidate attempts and proxy
  forwarded public traffic.
- Public unauthenticated abuse protection still depends on having a real edge
  proxy/header source in front of Next.js, as with any IP-based limiter.

### A-02. Approved-test Redis cache can serve stale tests for up to 1 hour

Severity: High  
Area: correctness, candidate assessment integrity
Status: Fixed 2026-06-21

Approved test payloads are cached in Redis by `test:{test_id}` and
`approved_tests:{jd_id}` for 3600 seconds. The original issue was that admin
mutation paths updated tests and questions without clearing those keys.

Fix landed:

- `attempt_service.invalidate_test_cache()` deletes `test:{id}` and
  `approved_tests:{jd_id}` entries.
- Test metadata, status, question update/delete, test delete, full generation,
  and single-test regeneration paths now invalidate candidate-facing cache.
- Regression tests fake Redis and prove metadata/status/question changes remove
  both relevant keys.

Evidence:

- `backend/app/services/attempt_service.py` now exposes the invalidation helper.
- `backend/app/services/test_service.py` calls it from test/question mutation
  and generation paths.
- `backend/tests/test_test_cache_invalidation.py` covers cache removal.

Impact:

- The known stale-cache window after admin test edits is closed.
- Attempts already in progress still use their assigned test identity; this fix
  targets stale candidate-facing test content and approved-test selection.

### A-03. Frontend and backend dependencies have known vulnerabilities

Severity: High  
Area: supply chain, security maintenance

Frontend `npm audit` reports 26 vulnerabilities, including 2 high. Backend
`pip-audit` reports 10 vulnerabilities in 3 packages.

Frontend audit highlights:

- `rollup` high severity via Sentry webpack plugin.
- `@opentelemetry/core` moderate via Sentry/OpenTelemetry.
- `postcss` moderate via Next's nested dependency.
- `uuid` moderate via Sentry and NextAuth dependency paths.

Backend audit highlights:

- `starlette==0.41.3` has multiple advisories with fixes up to 1.3.1.
- `pyasn1==0.4.8` has CVE-2026-30922 fixed in 0.6.3.
- `pytest==8.3.4` has CVE-2025-71176 fixed in 9.0.3.

Impact:

- Known vulnerable transitive packages remain in the deployed dependency graph.
- CI does not currently fail on dependency CVEs.

Recommended fix:

- Do not blindly run force fixes. Plan upgrade branches:
  `@sentry/nextjs` 8 -> 10, Next 15 -> latest compatible 16, NextAuth/Auth.js
  decision, Prisma 6 -> 7, React 19 patch updates.
- Upgrade backend Starlette/FastAPI together, plus `pyasn1` and pytest.
- Add `npm audit --audit-level=high` and `pip-audit` to CI once the known
  backlog is resolved.
- Keep Dependabot, but add gates so vulnerable PRs cannot be ignored silently.

### A-04. Prisma and Alembic both appear to own schema, but Prisma is stale

Severity: High  
Area: database operations, migration safety

Alembic/SQLAlchemy clearly own the current backend schema, but frontend
package scripts still expose Prisma push/migrate commands and
`schema.prisma` models many application tables incompletely.

Evidence:

- `frontend/package.json:11-14` exposes `db:push`, `db:migrate`, and
  `db:migrate:prod`.
- `frontend/prisma/schema.prisma:185-215` lacks fields currently present in
  SQLAlchemy.
- `backend/app/db/models/candidate.py:33-40` has `candidate_number`,
  `linkedin_url`, and `resume_url`, absent in Prisma.
- `backend/app/db/models/candidate.py:62-82` has `CandidateNumberCounter`,
  absent in Prisma.
- `backend/app/db/models/candidate.py:125-153` has `public_link_id`,
  `integrity_violation_reason`, and `terminated_at`, absent in Prisma.

Impact:

- Running Prisma migrate/push against a real DB can drift or damage an
  Alembic-managed schema.
- Developers may update one schema and forget the other.
- Generated Prisma types may lie about real database shape.

Recommended fix:

- Declare Alembic/SQLAlchemy as the sole schema owner.
- If Prisma is needed only for NextAuth/admin users, reduce the Prisma schema
  to the auth-owned tables or clearly mark non-auth models as read-only/legacy.
- Remove or rename Prisma migrate/push scripts, for example
  `danger:prisma-db-push`.
- Add a documentation note and CI check that prevents accidental Prisma schema
  authority expansion.

### A-05. Known default admin credentials remain seeded and documented

Severity: High for production, Medium for local dev  
Area: authentication, deployment hardening

The default admin account is created with a deterministic password and that
password is documented in user-facing docs.

Evidence:

- `frontend/prisma/seed.ts:6-12` hardcodes `acmeai@Talvyn.com` and
  `acmeai@r2026p#`.
- `README.md:13-16` shows the default credentials.
- `docs/deployment.md:278-283` documents the same production bootstrap account.

Impact:

- Any production instance that does not rotate the password is immediately
  exposed to anyone who has seen the repo or docs.
- There is no enforced first-login rotation.

Recommended fix:

- Allow deterministic credentials only in explicit development mode.
- Require `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` outside development.
- Generate a one-time bootstrap password if env vars are missing.
- Store a `must_change_password` style flag or force rotation after first login.

### A-06. Backend authorization is broad and not role/resource based

Severity: High before multi-user/SaaS use  
Area: authorization, data isolation

Admin routes mostly require `VerifiedInternal`, which proves the call came
through the trusted Next.js server, but not that the actor has a specific role
or owns the resource. Frontend middleware protects `/dashboard`, but backend
authorization remains all-or-nothing for most admin operations.

Evidence:

- `frontend/src/middleware.ts:51-58` checks only whether a session token exists
  for dashboard access.
- `backend/app/api/v1/admin.py:34-66` allows reset/restore with internal auth
  plus typed confirmation, but no role check.
- `backend/app/api/v1/jd.py` list/get routes accept any internal admin and
  list all JDs.

Impact:

- Works for a single-company, single-admin deployment.
- Unsafe for multiple recruiters, reviewer-only users, multiple departments, or
  SaaS tenants.
- Any logged-in admin can perform destructive actions if the UI exposes them or
  they call the proxy manually.

Recommended fix:

- Add backend dependencies such as `require_role("OWNER")` or
  `require_permission("admin:restore")`.
- Scope JDs, candidates, evaluations, webhooks, and settings by workspace or
  owner once the product supports multiple teams.
- Add negative tests: reviewer cannot reset data, non-owner cannot view another
  tenant's JDs, recruiter cannot manage webhooks.

## Security And Abuse Findings

### A-07. Authenticated admin proxy is catch-all

Severity: Medium  
Area: attack surface, future safety

The authenticated proxy forwards any method and path under `/api/proxy` to
FastAPI after verifying a NextAuth JWT and adding `X-Internal-Token`.

Evidence:

- `frontend/src/app/api/proxy/[...path]/route.ts:92-95` constructs the upstream
  path directly from route params.
- `frontend/src/app/api/proxy/[...path]/route.ts:210-214` exports GET, POST,
  PATCH, PUT, and DELETE for all proxied paths.

Impact:

- Any future internal FastAPI route automatically becomes reachable to all
  authenticated admins unless separately protected.
- Backend RBAC becomes more important because the proxy itself has no
  path/method allowlist.

Recommended fix:

- Add a path/method allowlist for admin proxy routes.
- Keep public and candidate proxies narrow, as they already are.
- Add tests for disallowed proxy paths returning 404.

### A-08. Webhook URL validation is too permissive

Severity: Medium  
Area: SSRF, network abuse
Status: Fixed 2026-06-21

Webhook subscriptions previously accepted `url: str` with length limits only.
Dispatch posts to the configured URL using `httpx.AsyncClient`, so unsafe
subscription destinations could become SSRF targets.

Fix landed:

- Create-webhook requests now require HTTPS.
- URLs with credentials, localhost-style hosts, local/internal DNS suffixes,
  single-label hosts, and private/local/reserved IP ranges are rejected.
- Regression tests cover valid HTTPS creation plus HTTP, localhost, and private
  IP rejection.

Evidence:

- `backend/app/schemas/webhook.py` now validates webhook URLs before they reach
  service persistence.
- `backend/tests/test_webhooks.py` covers the new rejection cases.

Impact:

- The direct admin-configured localhost/private-IP SSRF path is closed.
- DNS rebinding protection is still a possible future hardening layer if
  webhook creation is ever exposed to untrusted tenants.

### A-09. Magic-link token remains in the URL path during the exam

Severity: Medium  
Area: candidate token leakage

The token is no longer duplicated in query params, but it remains in the path
for the landing and exam routes.

Evidence:

- `backend/app/core/security.py:120-132` builds `/tests/<raw_token>`.
- `frontend/src/app/test/[token]/StartTestButton.tsx:43-45` routes to
  `/tests/${token}/exam?attempt=...`.
- `frontend/src/app/test/[token]/exam/page.tsx:1-13` documents the route.

Impact:

- URL path tokens can leak through browser history, server/proxy logs,
  referrer headers, screenshots, and support recordings.

Recommended fix:

- Redeem the magic token once at start.
- Issue a short-lived attempt session/token stored outside the URL.
- Redirect to a tokenless route such as `/tests/session/<attempt_session>/exam`.

### A-10. Login lockout is in-memory only

Severity: Medium  
Area: brute-force resistance

The login flow has a good dummy bcrypt timing defense and an email-based
lockout, but the lockout state is an in-process `Map`.

Evidence:

- `frontend/src/lib/auth/loginRateLimit.ts` stores attempts in memory.

Impact:

- Lockout resets on deploy/restart.
- It is not shared across multiple frontend instances.

Recommended fix:

- Use Redis for login lockout state in production.
- Consider rate limiting by email plus IP/subnet and add structured audit
  events for repeated failures.

### A-11. Admin backup/restore trusts large privileged payloads

Severity: Medium  
Area: data integrity, operational safety

Backup/restore is admin-only and confirmation-gated, but restore inserts
backup-provided table data and files with minimal semantic validation.

Evidence:

- `backend/app/api/v1/admin.py:50-66` accepts restore after a typed
  confirmation.
- `backend/app/schemas/admin.py:18-24` allows arbitrary table maps.
- `backend/app/services/admin_service.py:130-154` inserts cleaned rows and
  writes backup files.

Impact:

- A bad backup can restore inconsistent or malicious data.
- Large base64 payloads can pressure memory within the configured 50 MB proxy
  cap.
- Restore is all-or-nothing at the product level but file writes happen after
  DB commit.

Recommended fix:

- Validate table names, row counts, required columns, foreign-key consistency,
  backup version, and file path shape before deleting current data.
- Dry-run restore before commit.
- Consider streaming backup/restore for larger installs.

## Reliability, CI, And Maintainability Findings

### A-12. CI does not lint backend tests and does not run vulnerability gates

Severity: Medium  
Area: CI quality gates

CI lints only `backend/app`, not `backend/tests`. A full local Ruff run against
tests currently fails with 36 issues. CI also does not run `npm audit` or
`pip-audit`.

Evidence:

- `.github/workflows/ci.yml:29-30` runs `ruff check app/`.
- `.github/workflows/ci.yml:106-113` runs lint/type-check/build for frontend,
  but no audit.
- Local `ruff check backend/app backend/tests` found 36 test-suite errors.

Impact:

- Test quality debt can accumulate invisibly.
- Known CVEs remain advisory-only instead of build-blocking.

Recommended fix:

- Fix test-suite Ruff errors and change CI to `ruff check app tests`.
- Add vulnerability gates once the current CVE backlog is cleaned up.
- Consider adding `ruff format --check`.

### A-13. Frontend lint is warning-only and production build skips lint

Severity: Medium  
Area: frontend reliability

`npm run lint` exits successfully but reports 62 warnings. Next production build
skips lint entirely.

Evidence:

- `frontend/next.config.ts:5-11` sets `ignoreDuringBuilds: true`.
- `frontend/eslint.config.mjs:27-30` downgrades `no-explicit-any` and
  `react/no-unescaped-entities` to warnings.
- Current lint output includes React hook dependency warnings in candidate exam,
  upload, and generation context paths.

Impact:

- Hook dependency warnings can become stale closure bugs.
- Warnings tend to grow because CI remains green.

Recommended fix:

- Fix current warnings.
- Promote `react-hooks/exhaustive-deps` to error.
- Keep `no-explicit-any` as warning only with an explicit cleanup target.

### A-14. No browser E2E suite for critical workflows

Severity: Medium  
Area: regression risk, product confidence

Backend unit tests are strong, but the highest-value product flows cross the
frontend, Next proxies, backend, DB, Redis, worker, and candidate UI.

Evidence:

- No Playwright/Cypress config or frontend test suite was found.
- `frontend` has type/build/lint checks but no workflow tests.

Impact:

- Login, upload, generation, approval, public registration, candidate exam,
  submission, evaluation, and export can break even while unit tests pass.

Recommended fix:

- Add Playwright smoke tests for:
  login, JD upload/analyze/generate, approve tests, public-link registration,
  candidate exam submit, evaluation report, backup/restore smoke path, and
  basic permissions.

### A-15. WASM parser has no Rust tests

Severity: Medium  
Area: document parsing reliability

`cargo test` passes but runs zero tests.

Impact:

- Client-side PDF/DOCX parsing can regress without the Rust test command
  catching it.

Recommended fix:

- Add fixture tests for valid PDF and DOCX extraction.
- Add corrupt-file, empty-file, unsupported-file, and size guard tests.

### A-16. Deployment docs and ports drift

Severity: Low to Medium  
Area: operator experience

There are multiple local/prod port stories across README, compose, nginx, and
scripts.

Evidence:

- `docker-compose.yml:189-210` says standard docs describe port 80 but maps
  nginx as 81.
- `nginx/nginx.conf:34-37` listens on 81.
- `start.sh:14-17` says frontend 3001 and backend 8000, while compose maps
  frontend 3003 and backend 9000.
- README still advertises `http://localhost` port 80.

Impact:

- New operators can follow correct-looking docs and still land on the wrong
  URL.

Recommended fix:

- Decide the canonical dev entrypoint.
- Parameterize the nginx port or document the local override very explicitly.
- Update README, `start.sh`, compose comments, and deployment docs together.

### A-17. Generated `site/` output is tracked despite being ignored

Severity: Low  
Area: repo hygiene

`site/` is in `.gitignore` but 74 files under `site/` are tracked, around
5.9 MB.

Impact:

- Generated docs can create noisy diffs and confusion about whether docs are
  source-built or committed.

Recommended fix:

- If GitHub Pages builds from source, untrack `site/`.
- If committed static output is intentional, remove `site/` from `.gitignore`
  and document the policy.

## Product And UI/UX Findings

### A-18. Candidate exam needs mobile and accessibility QA

Severity: Medium  
Area: candidate trust, accessibility

The exam UI is responsive, but no formal mobile-device or WCAG audit is
documented. Timed assessments are high-stakes and need stronger QA than normal
admin dashboards.

Recommended fix:

- Test iPhone/Android viewport sizes, mobile keyboard behavior, long open-ended
  answers, code question scrolling, sticky timer/header spacing, zoom, and
  orientation changes.
- Add keyboard-only and screen-reader checks for the candidate flow.

### A-19. Strict tab/window termination may create false-positive candidate failures

Severity: Medium  
Area: candidate experience, integrity policy

The first tab switch/window blur terminates the attempt and invitation. This is
clearly communicated, but it is harsh for accidental OS focus changes,
permission popups, browser UI interactions, or mobile interruptions.

Recommended fix:

- Keep strict mode as a configurable policy per assessment.
- Add a pre-test system check and clearer "do not leave this window" readiness
  step.
- Consider a warning threshold for lower-stakes assessments.

### A-20. Code-style questions exist without a real coding-assessment product

Severity: Medium  
Area: product clarity

The schema and UI support code-style fields, but there is no sandboxed runner,
test cases, package install, terminal, plagiarism/code similarity, or language
runtime policy.

Recommended fix:

- Either hide/de-scope code questions in production, or build a real sandboxed
  coding assessment feature with execution isolation and test cases.

### A-21. Collaboration and hiring pipeline features are still shallow

Severity: Low to Medium  
Area: recruiter workflow

Talvyn can evaluate and rank candidates, but does not yet have team
comments, shareable candidate cards, persistent candidate portal, hiring-stage
pipeline, or candidate-facing feedback reports.

Recommended fix:

- Add candidate timeline and stages.
- Add team comments on candidate/evaluation pages.
- Add shareable read-only report links with admin-only controls hidden.
- Add optional candidate feedback reports if product scope requires it.

### A-22. Enterprise/compliance readiness is not complete

Severity: Medium for enterprise sales  
Area: compliance, procurement

The system has useful security docs, audit logs, and self-hosting posture, but
not a formal SOC 2/GDPR/DPA/security questionnaire package, data retention UI,
tenant model, or scheduled backup/restore verification.

Recommended fix:

- Add candidate export/delete and retention controls.
- Add scheduled off-server backups and quarterly restore drills.
- Build a security/compliance packet only after RBAC and tenant boundaries are
  real.

## Confirmed Strengths

- Backend unit coverage is broad: 297 tests passing.
- Backend app lint is clean.
- Frontend type-check and production build pass.
- Alembic migrations are used and CI applies them to a fresh Postgres service.
- Candidate raw tokens are not stored; stored invitation tokens are HMAC hashes.
- Attempt-specific mutations verify token ownership server-side.
- Correct answers/explanations are stripped from candidate responses.
- MCQ shuffled-answer scoring has tests.
- Redis backs shared rate-limit/progress/job state across workers.
- ARQ worker isolates long Ollama jobs from API request handlers.
- Uploads validate extension, size, and magic bytes.
- Public and candidate Next.js proxies are narrow allowlists.
- Security headers exist in `next.config.ts`.
- Docker Compose config validates.
- Real `.env` files are ignored and not tracked.

## Recommended Remediation Order

1. Patch backend and frontend dependency CVEs with planned framework upgrades.
2. Resolve Prisma/Alembic schema authority and remove unsafe Prisma scripts.
3. Harden default admin seeding and force credential rotation.
4. Add backend RBAC/resource checks for destructive and sensitive admin routes.
5. Redeem magic-link path tokens into short-lived tokenless exam sessions.
6. Clean CI gates: lint backend tests, add audit gates, fix frontend warnings.
7. Add Playwright E2E smoke coverage for the full hiring workflow.
8. Add WASM parser tests.
9. Clean deployment docs/ports and tracked generated docs.
10. Complete mobile/accessibility QA and candidate UX hardening.

## Bottom Line

Talvyn is usable and technically credible as a self-hosted internal hiring
assessment platform. Its core workflow is implemented and the backend has real
test depth. The app should not yet be positioned as enterprise/SaaS-ready
without resolving the high-priority issues above, especially dependency CVEs,
schema ownership, default credential hardening, and role/resource
authorization.
