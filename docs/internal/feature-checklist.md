# Talvyn Feature Checklist

Last updated: 2026-06-21 (Visual rebrand verification)

This checklist compares Talvyn against common assessment-platform features
seen in products such as TestGorilla, HackerRank, Codility, and Vervoe. Use it
as a living product tracker: mark items as they ship, move partial items to done
when they are production-ready, and use backlog rows for the next roadmap pass.

## Status Key

| Checkbox | Status | Meaning |
| --- | --- | --- |
| `[x]` | Done | Implemented in the current product and usable today. |
| `[ ]` | Partial / config-dependent | Foundation exists, but the feature needs configuration, hardening, or missing UI to be fully production-ready. |
| `[ ]` | In development | A feature is actively designed or partially implemented, but should not be treated as complete yet. |
| `[ ]` | Backlog | Not implemented yet. Usually a competitor-parity gap or future roadmap item. |

## Competitor Reference Baseline

| Platform | Feature signals worth tracking |
| --- | --- |
| [TestGorilla](https://www.testgorilla.com/assessments/) | AI assessment builder, 350+ test library, custom questions, AI interviews, resume scoring, candidate behavior monitoring, ranked results, and direct candidate links. Its [ATS integrations page](https://www.testgorilla.com/ats-integrations/) also highlights ATS sync, candidate progress tracking, Zapier/Make, and OpenAPI. |
| [HackerRank Screen](https://www.hackerrank.com/products/screen/) | Role and skill assessment library, JD-generated tests, AI-era skill checks, identity/proctoring signals, plagiarism/integrity tooling, ATS/HRIS integrations, bulk invitations, and reporting dashboards. |
| [Codility](https://www.codility.com/) | Screen, Interview, and Skills Intelligence products; developer IDE-style assessments with multi-file projects, package install, terminal access, automated code analysis, AI-use policy support, compliance, ATS/HRIS integrations, and API access. |
| [Vervoe](https://vervoe.com/features/) | Auto grading and ranking, detailed score breakdowns, candidate feedback, team comments, assessment reporting, integrations/API, timed tests, file uploads, candidate status, and mobile-friendly assessment delivery. |

## Product Position Summary

Talvyn is strongest today in JD-driven assessment generation, private magic
links, public apply links, AI evaluation reports, admin search, local
deployment, one-click maintenance tools, an actor-attributed admin audit log,
signed outbound webhooks, server-enforced exam integrity (hard tab-switch
termination, copy/paste blocking), an opt-in probabilistic AI-likeness
estimate for candidate answers, a standalone admin AI Checker for documents,
and ops observability. The largest
competitor-parity gaps are a validated prebuilt test library, ATS integrations,
live technical interviews, advanced proctoring, plagiarism detection, team
collaboration, and formal enterprise compliance packaging.

## 2026-06-21 Full Audit Follow-Up

This section captures the latest complete engineering audit so the findings do
not live only in chat. The audit re-ran backend tests, backend lint, frontend
type-check, frontend build, frontend lint, frontend dependency audit, and the
WASM parser test command. No active Critical/P0 issue was found, and several
older audit claims were re-verified as fixed. The remaining work is production
hardening, schema/process cleanup, dependency cleanup, and broader workflow
testing.

| Priority | Status | Finding | Why it matters | Next action |
| --- | --- | --- | --- | --- |
| P1 | Done | Candidate/public rate-limit identity | Public and candidate traffic used to risk shared buckets behind the Next.js proxy. | Shipped 2026-06-21: public/candidate proxies forward a sanitized client IP with internal proxy proof; backend trusts it only when the internal token matches and falls back safely for direct calls. |
| P1 | Done | Approved-test Redis cache invalidation | Approved tests and test question payloads could stay stale for up to 1 hour after status/question edits. | Shipped 2026-06-21: test metadata/status/questions/regeneration/delete paths invalidate `test:{id}` and `approved_tests:{jd_id}`; regression tests added. |
| P1 | Backlog | Prisma/Alembic schema authority | Frontend Prisma schema is behind SQLAlchemy/Alembic models, while Prisma migrate/push scripts still exist. | Make Alembic the only schema owner, or explicitly reduce Prisma to auth-only usage and remove/hide dangerous migrate scripts. |
| P1 | Backlog | Default admin credential hardening | The seeded admin email/password are documented and deterministic. | Require env-provided seed password outside development and force first-login rotation or one-time generated credential. |
| P2 | Backlog | Magic-token path exposure | Candidate private token is no longer duplicated in query params, but it remains in the URL path through the exam. | Redeem magic link once, create a short-lived attempt session, and redirect to a tokenless/session route. |
| P2 | Partial / config-dependent | Backend RBAC/resource ownership | Login protection exists, but destructive/admin operations are mostly all-or-nothing internal auth. | Enforce server-side roles and resource ownership before multi-team or SaaS use. |
| P2 | Done | Webhook URL SSRF hardening | Webhook destinations could previously be localhost, private IPs, or plain HTTP URLs. | Shipped 2026-06-21: create-webhook validation now rejects non-HTTPS, credentials, localhost/internal suffixes, single-label hosts, and private/local/reserved IP ranges. |
| P2 | Backlog | Dependency upgrade pass | `npm audit` reports 26 vulnerabilities, including 2 high transitive findings. | Plan tested upgrades for Sentry, Next, NextAuth/Auth.js, Prisma, React, and add dependency scanning gates. |
| P2 | Backlog | Frontend lint debt | Lint passes with warnings, including React hook dependency warnings. | Fix warnings, make hook dependency warnings fail CI, and keep `no-explicit-any` as a temporary warning only if needed. |
| P3 | Backlog | Port/docs drift | Compose/nginx use port 81 in places while README/deployment/startup text still mentions port 80 or other stale ports. | Make local/prod ports explicit and update README, deployment docs, and startup output from one source of truth. |
| P3 | Backlog | Tracked generated docs output | `site/` is ignored but still tracked. | Either intentionally publish generated docs from git, or untrack `site/` and build docs in CI/GitHub Pages. |
| P3 | Backlog | WASM parser test coverage | `cargo test` succeeds but runs 0 Rust tests. | Add fixtures for PDF/DOCX extraction, corrupt files, and file-size guard behavior. |
| P3 | Backlog | Browser E2E coverage | Backend unit tests are strong, but critical admin-to-candidate workflows lack Playwright/Cypress coverage. | Add smoke tests for login, JD upload/analyze/generate/approve, public registration, exam submit, evaluation report, backup/restore, and permissions. |

## Core Hiring Workflow

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | Admin login and protected dashboard | Admin dashboard is protected by NextAuth/session middleware. | Keep strengthening role checks as multi-user features grow. |
| [x] Done | Job description upload | Admins can upload JD files and extract role details. | Browser-side parsing is supported with server fallback. |
| [x] Done | Client-side document parsing | WASM parser extracts PDF/DOCX text in the browser before upload. | Server parser remains fallback for failed extraction. |
| [x] Done | AI JD analysis | Backend extracts skills, responsibilities, and role context. | Powered by Ollama/local model service. |
| [x] Done | AI test generation from JD | Talvyn generates multiple tests per JD. | Supports technical screening, practical reasoning, and role-specific tests. |
| [x] Done | Difficulty distribution customization | Admins can tune generated test difficulty distribution. | Documented in the difficulty customization changelog. |
| [x] Done | Test review and approval | Generated tests start as draft and must be approved before inviting candidates. | Prevents unreviewed AI content from going live. |
| [x] Done | Question editing | Admins can edit generated questions. | Existing test detail workflow supports review/edit. |
| [x] Done | Question regeneration and deletion | Admin workflow supports iterative question cleanup. | Keep regression tests around generated question mutations. |
| [x] Done | Candidate preview | Admins can preview the candidate experience before approving. | Includes answer-key visibility for review. |
| [x] Done | Single candidate invite | Admins can invite one candidate with selected approved tests. | Creates a private invitation token. |
| [x] Done | Bulk CSV invites | Admins can upload candidate CSVs and send many invitations. | Current documented limit is 50 candidates per batch. |
| [x] Done | Public assessment links | Admins can create one `/apply/<slug>` link for a JD's approved tests. | Each candidate self-registers and receives a unique private test token. |
| [x] Done | Manual magic-link fallback | If email fails, admins can copy the private `/tests/<token>` link. | Important while production email DNS/API keys are still being configured. |
| [ ] Partial / config-dependent | Email delivery | Resend and SMTP paths exist and were code-reviewed (STARTTLS, auth, non-blocking) — neither is configured in production yet. | Set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD` (recommended: Brevo free tier, 300/day, no card) or `RESEND_API_KEY`/`EMAIL_FROM` in production `backend/.env`, then recreate the `backend` and `worker` containers. See `backend/.env.example` and `docs/changelog/production-reliability-fixes.md`. |
| [ ] Backlog | Sourcing candidates | No sourcing/search product yet. | Competitors increasingly bundle sourcing with assessments. |
| [ ] Backlog | Resume scoring before invite | No resume-ranking workflow yet. | TestGorilla positions resume scoring as a screening feature. |

## Candidate Experience

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | Private magic-link landing page | Candidates open `/tests/<token>` to view their assessment invitation. | Legacy `/test/<token>` compatibility is also supported. |
| [x] Done | Public self-registration page | Candidates open `/apply/<slug>` and enter identity details. | Backend creates/reuses candidate and redirects to a unique private link. |
| [x] Done | Multiple tests per invitation | Candidates can complete all approved tests assigned to the invite. | UI shows current test number and next test. |
| [x] Done | Timed assessment UI | Candidate exam page includes a timer. | Timer starts when the test begins. |
| [x] Done | Autosave | Answers are saved automatically during the exam. | Bulk autosave reduces request load. |
| [x] Done | Resume in-progress attempt | Candidate exam state reloads from the backend. | Helps recover from refreshes or temporary network issues. |
| [x] Done | One-time/private candidate token | Invitation tokens are private and tied to a candidate invitation. | Public links are deliberately not candidate tokens. |
| [x] Done | Completion flow | Candidate sees a completion page after submission. | Continue improving post-submit guidance if needed. |
| [ ] Partial / config-dependent | Mobile-friendly delivery | UI is responsive, but no dedicated mobile QA checklist is documented. | Add browser/device QA for candidate pages. |
| [ ] Backlog | Candidate profile / portal | Candidates do not have persistent login/profile pages. | Useful for repeat applicants or talent pool workflows. |
| [ ] Backlog | Candidate-facing feedback report | No automated candidate feedback email/report yet. | Vervoe advertises candidate feedback as a feature. |
| [ ] Backlog | Accessibility certification pass | No formal WCAG audit is documented. | Add keyboard/screen-reader QA for candidate exam flows. |

## Assessment Content

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | Multiple-choice questions | MCQs are generated, displayed, answered, and auto-scored. | Core screening format. |
| [x] Done | Open-ended written questions | Written questions are generated and AI-graded. | AI feedback is shown in evaluation reports. |
| [x] Done | Generated explanations/criteria | Generated tests include answer explanations and grading context. | Review remains admin-controlled. |
| [ ] Partial / config-dependent | Code-style questions | Types and UI paths exist, but there is no full coding sandbox/test-runner product. | Build execution, test cases, plagiarism, and language support before marking done. |
| [ ] Backlog | Large validated test library | Talvyn generates tests per JD instead of offering a 350+ validated library. | TestGorilla and HackerRank emphasize prebuilt libraries. |
| [ ] Backlog | Personality/culture assessments | No personality or culture-add library. | Decide whether this fits Talvyn's product scope. |
| [ ] Backlog | Cognitive/language assessments | No dedicated cognitive, language, or typing test library. | Competitor parity item if targeting broader HR screening. |
| [ ] Backlog | AI interview / video interview | No asynchronous AI interview or video/audio question flow. | TestGorilla and several modern platforms include this category. |
| [ ] Backlog | Live technical interview | No interviewer workspace, live editor, or paired coding session. | HackerRank Interview and Codility Interview are direct references. |

## Scoring, Results, And Analytics

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | MCQ auto-scoring | MCQ answers are automatically scored. | Database score verification endpoint exists. |
| [x] Done | AI open-ended scoring | Open-ended answers are evaluated by AI. | Evaluation service produces scores and feedback. |
| [x] Done | Candidate evaluation report | Admins can view score, recommendation, summary, strengths, weaknesses, and question feedback. | Report is marked as preliminary AI assessment. |
| [x] Done | Admin decision override | Admins can override recommendation and add notes. | Keeps human hiring decision in control. |
| [x] Done | Per-question score adjustment | Admins can adjust individual question scores. | Useful for correcting AI scoring edge cases. |
| [x] Done | Leaderboard | Admins can compare candidates for a JD and globally. | Good baseline ranking feature. |
| [x] Done | System/JD report | Aggregate JD report page exists. | Continue adding conversion metrics. |
| [x] Done | DOCX export | Evaluation export endpoint returns a DOCX report. | Frontend downloads `evaluation_<id>.docx`. |
| [x] Done | Similar candidate search | pgvector-based similarity endpoint exists. | Disabled by default; requires `EMBEDDING_ENABLED=true` and embedding model. |
| [ ] Partial / config-dependent | Automatic evaluation timing | Evaluation support exists, but some flows still expose manual trigger/retry paths. | Decide desired product behavior and test end-to-end. |
| [x] Done | Public-link analytics | Public links surface a views -> registrations -> starts -> completions funnel plus a recommendation breakdown / pass rate over evaluated attempts. | No historical trend chart yet — current snapshot only; revisit if conversion-over-time matters. |
| [ ] Backlog | Candidate cards / shareable reports | No shareable candidate cards for hiring managers. | Vervoe calls this out as a collaboration/reporting feature. |
| [ ] Backlog | Question-level benchmark analytics | No benchmark across candidates/questions beyond current reports. | Add difficulty, discrimination, and common-miss analysis. |
| [ ] Backlog | Talent pool ranking across jobs | Global leaderboard exists, but not a full talent-pool CRM. | Useful for reusing strong candidates. |

## Integrity, Security, And Proctoring

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | HMAC-hashed invitation tokens | Raw private tokens are not stored. | Tokens are bound to invitation context. |
| [x] Done | Token expiry | Invitation links expire after the configured window. | User guide documents 72 hours. |
| [x] Done | Revoke/resend support | Invitations can be revoked or reissued. | Reissue rotates the private token. |
| [x] Done | Attempt-token ownership checks | Candidate write routes verify attempt token ownership. | Keep regression tests for wrong-token writes. |
| [x] Done | Suspicious event logging | Candidate UI logs suspicious browser behaviors. | Includes client-side event capture during active attempts. |
| [x] Done | Copy/paste restriction | Copy, cut, paste, drag/drop, right-click, and Ctrl/Cmd+C/V/X/S/P/A are blocked in the exam UI (Ctrl/Cmd+A still works inside an answer field for normal editing), with a candidate-facing toast and backend event logging. | A deterrent, not unbypassable protection — a determined candidate with OS-level tools could still circumvent it. Documented as such; never claim otherwise in admin-facing copy. |
| [x] Done | Strict tab/window-switch termination | The first tab switch, window blur, or visibility loss during an active attempt hard-terminates that attempt **and** the parent invitation (`AttemptStatus`/`InvitationStatus.TERMINATED`, with `integrity_violation_reason` + `terminated_at`), blocking every remaining test in the invitation. Enforced server-side in `start_attempt`/`submit_attempt`/`validate_token`, not just the frontend. | Fullscreen-exit detection intentionally not added — no fullscreen mode exists in the app yet. |
| [x] Done | Invitation-wide integrity lockout | A violation in any one test blocks every other approved test in the same invitation — enforced via the invitation-level `TERMINATED` status, checked at the single `start_attempt` chokepoint. | Covered by `tests/test_integrity_termination.py`. |
| [x] Done | Rate limiting | Redis-backed rate limiting is documented. | Avoids per-worker in-memory limiter drift. |
| [ ] Partial / config-dependent | Candidate identity verification | Public registration collects name/email, but no ID or webcam verification. | HackerRank and other platforms advertise stronger identity signals. |
| [x] Done | Anti-cheat policy messaging | Candidates must acknowledge an "Assessment integrity rules" notice (no copy/paste, leaving the window ends the assessment, autosave) before starting. | AI-use policy line intentionally deferred — could now reference the AI-likeness estimate below. |
| [ ] Backlog | Webcam/face proctoring | No webcam, face detection, or session recording. | Competitor parity for high-stakes exams. |
| [ ] Backlog | Plagiarism/code similarity detection | No plagiarism engine for written/code answers. | Important before launching coding assessments at scale. |
| [ ] Backlog | Lockdown browser | No lockdown browser support. | Usually enterprise-only; evaluate need carefully. |
| [x] Done | AI-likeness / AI-use detection | Opt-in (`AI_LIKENESS_ENABLED=false` by default) per-answer + aggregate AI-likeness estimate for open-ended answers, shown on the evaluation report with confidence level, flagged-answer count, suspicious phrases, and explanation. | Explicitly framed as a **probabilistic writing signal, never a verdict** everywhere it appears (UI copy, docs). Never fails evaluation — see `ai_detection_service.py`. Scoped to open-ended answers only; code answers keep their existing informal "looks AI-generated" note inside AI feedback text. |
| [x] Done | Standalone AI Checker | Admin sidebar includes **AI Checker** for pasted text or PDF/DOCX/TXT/Markdown uploads. The frontend extracts document text, queues analysis through `/api/v1/ai-checker/jobs`, polls `/api/v1/ai-checker/jobs/{job_id}`, and displays estimated AI-likeness, confidence, recommendation, suspicious phrases, and explanation. | Runs as an explicit admin action using the existing Ollama model, separate from the opt-in automatic candidate-answer AI-likeness flag. Job-based polling avoids long Vercel/proxy request timeouts. Still a probabilistic signal, never proof. |

## Admin Collaboration And Workflow

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | Dashboard overview | Admin dashboard includes KPI cards, an activity chart, candidate pipeline funnel, recent activity feed, top roles by completion, and system status — all backed by real data (see `docs/changelog/graphite-indigo-rebrand-phase-a.md`). | Keep metrics aligned with real hiring funnel. |
| [x] Done | Admin global search | Dashboard header search finds candidates, candidate numbers, emails, JDs, tests, and results. | Available in desktop header and mobile dashboard search row. |
| [x] Done | Candidate status table | Admins can track invitation/candidate status. | Statuses include pending, opened, in progress, completed, expired, revoked, and terminated (integrity violation). |
| [x] Done | Notification bell | Frontend has notification UI. | Confirm production event coverage as new workflows ship. |
| [x] Done | Basic settings page | Settings area exists with configuration summaries and admin maintenance tools. | Expand as product configuration grows. |
| [x] Done | Admin data reset | Settings Danger Zone can delete all hiring/product data while preserving admin users. | Requires exact `DELETE ALL` confirmation before the action is enabled. |
| [x] Done | Audit log | Settings shows a paginated trail of invitation revoke/resend, evaluation overrides, and data reset/restore, attributed to the admin who acted. | Survives data reset/restore by design. Extend coverage as new sensitive actions ship (webhooks, RBAC, comments). |
| [ ] Partial / config-dependent | User roles / permissions | Admin auth exists (`User.role` enum), and audit logging now attributes actions to an admin, but rich RBAC enforcement is not yet built. | Add recruiter, reviewer, admin, and owner permission checks before multi-team use. |
| [ ] Backlog | Team comments | No comment thread on candidates/evaluations. | Vervoe highlights team comments and collaboration. |
| [ ] Backlog | Hiring-stage pipeline | Candidates are tracked by assessment status, not full hiring pipeline stages. | Add shortlisted, interview, offer, rejected stages if needed. |
| [ ] Backlog | Multi-company tenancy | No full workspace/company tenant model documented. | Required for SaaS multi-customer deployment. |

## Integrations

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | Email provider integration | Resend API and SMTP paths are present. | Production depends on verified sender configuration. |
| [x] Done | Vercel candidate/admin frontend option | Magic links can point to `https://acmeTalvyn.vercel.app`. | Frontend proxies public/candidate calls to backend. |
| [x] Done | GitHub Actions auto-deploy | Production deploy workflow SSHes to the server after CI passes. | Requires `PROD_SSH_KEY` secret and server checkout. |
| [x] Removed | Ngrok/proxy deployment | ngrok has been retired — `deploy-ngrok.sh` and the ngrok proxy branching are removed from the repo. Deployment now targets a stable domain behind a reverse proxy (`docker-compose.prod.yml` + host Nginx/Certbot). | See `docs/deployment.md`; the old tunnel teardown lives in `docs/talvyn-rebrand-checklist.md`. |
| [ ] Backlog | ATS integrations | No Greenhouse, Lever, Workday, Ashby, or BambooHR integration. | Build on top of the new webhook events instead of one-off direct integrations. |
| [ ] Backlog | Zapier/Make integration | No no-code automation connector. | Thin layer on top of the new webhook events — low incremental cost now that they exist. |
| [ ] Backlog | Public customer API | No documented external API product with API keys/scopes. | Competitors advertise OpenAPI/API access. |
| [x] Done | Webhooks | Admins can configure signed outbound webhooks (Settings -> Webhooks) for invite created, test started, test submitted, and evaluation ready, with retry/backoff, a delivery log, and a "send test event" button. | Subscriptions are global (not yet scoped per JD) — fast-follow if needed. |
| [ ] Backlog | Calendar/video scheduling | No interview scheduling integration. | Needed if Talvyn expands beyond assessment. |

## DevOps, Observability, And Enterprise Readiness

| Status | Feature | Current Talvyn state | Notes / next action |
| --- | --- | --- | --- |
| [x] Done | Docker Compose deployment | Dev and production compose files exist. | `start.sh` orchestrates local startup. |
| [x] Done | Alembic migrations | Database migrations are used and fresh-db commit issue was fixed. | Keep CI migration check. |
| [x] Done | PostgreSQL and Redis | Core persistence and shared state services are included. | Redis backs rate limiting/job state. |
| [x] Done | Ollama/local AI runtime | AI generation/evaluation uses Ollama. | Hardware and model setup remain deployment concerns. |
| [x] Done | Background worker | ARQ worker isolates long AI jobs from API process. | `docker-compose.prod.yml` was missing this service entirely (dev-only oversight) until 2026-06-21 — see `docs/changelog/production-reliability-fixes.md`. Confirm the `worker` container is actually running on any existing production deployment, not just present in the compose file. |
| [x] Done | Prometheus/Grafana | Metrics stack is included. | FastAPI exposes metrics for scraping. |
| [x] Done | GlitchTip/Sentry-compatible error tracking | Optional error tracking is wired. | Zero overhead when DSN is not set. |
| [x] Done | MinIO/S3-compatible file storage | Optional object-storage backend exists. | `STORAGE_BACKEND=s3` activates it. |
| [x] Done | Health/readiness endpoints | API exposes health endpoints. | Useful for deploy and monitoring. |
| [x] Done | Documentation site | MkDocs documentation is maintained. | Feature checklist now lives in the Guides nav. |
| [x] Done | One-click backup/restore | Settings can download and restore a Talvyn JSON backup containing hiring data and uploaded JD files. | Admin users are not included; reset/restore preserve sign-in. Keep scheduled server backups for production safety. |
| [ ] Partial / config-dependent | CI quality gates | GitHub Actions run tests/lint/build, but warnings and environment-specific auth can still block deploys. | Keep CI green before relying on auto-deploy. |
| [ ] Partial / config-dependent | Scheduled backup operations | Manual and in-app backup paths exist, but no automated off-server schedule is documented as active. | Add scheduled `pg_dump`/volume backups and quarterly restore checks. |
| [ ] Backlog | Browser E2E tests | No full Playwright/Cypress product test suite is documented. | Add invite, public-link, test-taking, and report flows. |
| [ ] Backlog | Formal compliance pack | No SOC 2/GDPR/DPA/security questionnaire package. | Needed for enterprise sales. |
| [ ] Backlog | Data retention controls | No recruiter-facing retention/deletion policy UI. | Add candidate deletion/export and retention windows. |

## Reviewer Suggested Next Features

These are the next features I would prioritize if Talvyn is being reviewed
as a real hiring-assessment web app, not just as a demo. The order balances
user trust, competitor parity, implementation risk, and resume/interview value.

| Priority | Suggested feature | Why this should be next | Reviewer acceptance criteria |
| --- | --- | --- | --- |
| Shipped | Production readiness dashboard | Email, uploads, AI generation, workers, Redis, storage, and public URLs are all critical dependencies. Admins should know the system is healthy before inviting candidates. | Settings -> Overview now shows System Health with database, worker queue, Redis, storage, Ollama, email provider, magic-link base URL, allowed origins, last check time, and plain-English fix guidance. |
| Shipped | Specific upload failure diagnostics | Upload is a first-touch workflow. A generic "Upload failed" creates confusion and support overhead. | Upload UI now distinguishes unsupported file type, size limit, empty file, malformed upload request, backend unavailable, proxy misconfiguration, backend processing failure, and parse failure. |
| Shipped | JD workflow stepper and "next action" banner | The product flow is strong but mentally scattered: upload -> analyze -> generate -> approve -> invite -> review. | Shipped: JD detail and JD tests pages show a compact stepper with done/current/upcoming/blocked state, computed from existing JD/tests/invitations data and correct after refresh. Dashboard-level next-action surfaced via the new Needs Attention panel (draft tests, JDs without tests, pending evaluations, email failures, unhealthy system checks). |
| Shipped | Results inbox as default review hub | Recruiters usually ask "who needs review?" before "which JD should I open?" | Results page (`/dashboard/results`) now defaults to a cross-JD attempts table with filters for candidate, JD, attempt status, recommendation, integrity, and submitted-date range, via new `GET /api/v1/evaluation/inbox`. The previous JD-picker view moved to `/dashboard/results/by-jd`, still reachable from a "Browse by Job" button. Per-JD results/leaderboard/report pages unchanged. |
| P1 | Candidate timeline and hiring stage | Candidate profiles now group tests, but hiring decisions need history and stage. | Candidate profile shows timeline events and editable stages: New, Invited, Started, Submitted, Needs review, Shortlisted, Interview, Rejected, Hired. Stage changes are audit-logged. |
| P1 | Team comments and shareable candidate reports | Vervoe-style collaboration/report sharing is a visible product maturity gap. | Admins can comment on candidate profiles/evaluations. A read-only share link or export hides admin-only controls and shows candidate context, scores, strengths, weaknesses, and decision status. |
| P2 | Pre-test system check and review-before-submit | Candidate trust matters in timed exams; users should know the browser/network is ready and see unanswered questions before final submit. | `/tests/<token>` checks API reachability, supported browser, autosave endpoint, and optional integrity policy. Submit dialog lists unanswered question numbers with quick navigation. |
| P2 | Skill coverage matrix and question quality warnings | Generated tests need explainability before approval. Admins should see whether extracted skills are actually covered. | Test review shows skills vs. questions/tests coverage, missing skills, duplicate topics, low question count, missing answer key/rubric, and abnormal duration/marks warnings. |
| P2 | Question-level analytics | After multiple candidates, admins need to know which questions are too easy, too hard, or confusing. | JD report shows per-question average score, miss rate, completion rate, time spent if available, and flags weak/discriminating questions. |
| P2 | Zapier/Make connector layer | Webhooks already exist, so no-code automation is now a low-cost integration win. | Documentation and UI expose webhook templates for invite created, test started, submitted, evaluated. Include retry log, sample payloads, and copyable Zapier/Make setup notes. |
| P3 | RBAC and workspace roles | Multi-user auth exists, but real teams need permission boundaries. | Roles are enforced server-side: owner/admin/recruiter/reviewer. Sensitive actions like reset, restore, webhooks, and user management require admin/owner. |
| P3 | Data retention and candidate deletion/export | Enterprise buyers will ask about privacy controls. | Admins can delete/export candidates and configure retention windows. Deletion is audit-logged and does not break aggregate reports unexpectedly. |
| P3 | Browser E2E test suite | The app now has enough workflows that regression risk is real. | Playwright covers login, JD upload/analyze/generate/approve, public link self-registration, candidate exam submit, evaluation report, backup/restore smoke path, and permission checks. |
| P4 | Coding assessment decision | Code-style fields exist, but the product should either commit to a real coding sandbox or clearly de-scope it. | Product decision is documented. If building: add sandboxed execution, test cases, language/runtime limits, plagiarism/code similarity, and security constraints. If not: hide code-question affordances from production UI. |

### Best Claude Work Batches

Give Claude one batch at a time and review each batch before moving on:

1. ~~**Reliability batch:** System Health, upload diagnostics, Settings tabs,
   deployment/readiness copy.~~ Shipped. Remaining fast-follow: dashboard-wide
   readiness banner and invite-success copy cleanup.
1.5. ~~**Design-system batch (Phase 1/2):** Shared `PageHeader`,
   `Breadcrumbs`, `EmptyState`, `ErrorState`, `Skeleton`, `SectionHeader`,
   `StatusBanner`, `ConfirmDialog`, `Stepper` under
   `frontend/src/components/ui/`, applied to Dashboard, JDs list/detail/tests,
   Candidates, Results, Settings; JD workflow `Stepper` wired into JD detail
   and tests pages via `frontend/src/lib/jdWorkflow.ts`.~~ Shipped — no
   backend changes, no new dependencies. See
   `docs/ui-ux-audit.md#phase-12-design-system-pass-shipped`.
2. ~~**Workflow batch:** Results Inbox + Dashboard Needs Attention.~~ Shipped
   — new `GET /api/v1/evaluation/inbox` and `GET /api/v1/stats/attention`
   endpoints, no existing contracts changed. See
   `docs/ui-ux-audit.md#workflow-batch-shipped`. Remaining from the original
   batch idea: candidate timeline (deferred to the Collaboration batch below,
   since it overlaps with hiring stages).
2.5. ~~**Graphite + Electric Indigo rebrand — Phase A:** design tokens,
   dark sidebar/layout, dashboard rebuild (KPI cards, activity chart,
   candidate pipeline, recent activity, top roles, system status).~~ Shipped
   — new `GET /api/v1/stats/pipeline`, `/timeline`, `/roles` endpoints
   (additive, read-only), `recharts` added as a new dependency. Scoped down
   from an 11-step full-app rebrand request to this one phase; remaining
   steps (badge pass, other pages, candidate UI, AI-specific states) are
   follow-up batches. See
   `docs/changelog/graphite-indigo-rebrand-phase-a.md`. Not visually
   verified in a browser this session (no browser tool available, and the
   local docker frontend container was already crash-looping on an
   unrelated Prisma/Postgres seed error) — recommend a manual smoke test
   before relying on this as final.
2.6. ~~**Graphite + Electric Indigo rebrand — Phase B:** badge consistency
   pass across the app (`Badge` gained an `icon` prop; test status,
   leaderboard pass/fail, leaderboard test-type, and Results Inbox
   recommendation badges all migrated to the shared component).~~ Shipped —
   also fixed a real leftover bug the Phase A token change missed: the AI
   Checker's percentage gauge had the old sky-blue color hardcoded as a
   literal CSS value, immune to the token rebrand. See
   `docs/changelog/graphite-indigo-rebrand-phase-b.md`. Same "not visually
   verified in a browser" caveat as Phase A.
2.7. ~~**Graphite + Electric Indigo rebrand — Phase C:** applied
   `PageHeader`/`Breadcrumbs`/`EmptyState` to the 12 admin pages the
   Phase 1/2 design-system pass didn't reach (JD upload/invite/candidates,
   test detail/preview, candidate detail, results detail/by-JD/leaderboard/
   report, global leaderboard); also moved Settings' System Health row
   colors from literal Tailwind `emerald`/`amber`/`red` onto the app's
   `success`/`warning`/`danger` tokens.~~ Shipped. See
   `docs/changelog/graphite-indigo-rebrand-phase-c.md`. Same "not visually
   verified in a browser" caveat as Phases A/B.
2.8. ~~**Graphite + Electric Indigo rebrand — Phase D:** candidate-facing UI
   audit (magic link landing, rules ack, exam page, timer, autosave,
   submission confirmation, blocked/expired/terminated states).~~ Shipped —
   found the candidate UI was already calm and fully on-brand (it inherited
   indigo for free from the Phase A token change, and an earlier session's
   candidate-error-copy pass had already left it in good shape). Only real
   gap: the magic-link landing and public registration pages had no loading
   state during their server-side token/slug validation fetch — added one
   to each. See `docs/changelog/graphite-indigo-rebrand-phase-d.md`.
2.9. ~~**Graphite + Electric Indigo rebrand — Phase E:** AI-specific UI
   states recolored to the secondary purple accent (JD skill extraction,
   test generation banners/progress, AI Checker, Settings "AI Evaluation"
   section, Ollama health indicator on both Settings and Dashboard).~~
   Shipped — also fixed a real bug found along the way: the Ollama health
   row showed "AI check has not run yet." even when Ollama was healthy,
   because the backend's success path never sets a `detail` field; it now
   shows the actual configured/available model name. See
   `docs/changelog/graphite-indigo-rebrand-phase-e.md`.
2.10. ~~**Sidebar collapse + animation audit:** desktop sidebar gained a
   collapsible icon-only rail (animated, persisted preference); fixed
   several "appears/disappears instantly" gaps app-wide (notification/search
   dropdowns, dialog backdrops, extracted-text disclosure, Settings tabs,
   exam-page toast, stepper dot colors).~~ Shipped. Flagged but not done:
   skeleton-to-content crossfade, KPI count-up animation, staggered list
   entrances — bigger/more cosmetic asks, not "missing transition" bugs. See
   `docs/changelog/admin-sidebar-collapse-and-animations.md`.
2.11. ~~**Light Indigo color system — sidebar retint + AI accent
   unification:** sidebar recolored from graphite-black to the user's
   reference palette (every value already existed in the `brand` scale —
   one config repoint + a small active-pill style change); AI-specific UI
   (Phase E's purple convention) unified to a lighter indigo per the new
   palette, across all 11 files where it was a genuine "this is AI" marker
   — generic decorative purple elsewhere (badges, quick-link icon chips)
   deliberately left untouched.~~ Shipped. See
   `docs/changelog/light-indigo-sidebar-retint.md`.
2.12. ~~**Talvyn brand icon:** replaced the placeholder
   `BrainCircuit`-in-a-box favicon/logo (the favicon was still the
   pre-rebrand sky-blue `#0ea5e9`, never updated through any prior phase)
   with a real brand mark across the favicon, admin sidebar, mobile header,
   candidate-facing header, login page, and marketing site nav/footer.~~
   Shipped — new `TalvynIcon` component under `frontend/src/components/`;
   `BrainCircuit` deliberately left in place where it's a generic
   AI-indicator icon rather than the logo (AI Checker nav item, AI Checker
   page header, Settings "AI Evaluation" section). See
   `docs/changelog/Talvyn-brand-icon.md`.
2.13. ~~**Browser visual rebrand verification:** ran the Light Indigo/sidebar/
   icon rebrand in a real browser across marketing, login, admin
   expanded/collapsed/mobile, AI Checker, Settings, JD detail, evaluation
   report, public apply, candidate invitation, and exam pages.~~ Shipped —
   fixed the remaining AI-specific purple leftovers in the evaluation
   report AI-likeness ring and high-confidence AI-detection badges; made
   paired logo SVGs decorative for cleaner screen-reader output; confirmed
   the still-slate content area works against the indigo sidebar. See
   `docs/changelog/browser-visual-rebrand-verification.md`.
2.14. ~~**Super Admin role:** wired up the already-scaffolded `Role`
   (`ADMIN`/`SUPER_ADMIN`) field that existed on the `User` model and in
   the NextAuth session but was never read anywhere.~~ Shipped — new
   Super-Admin-only `/dashboard/users` page (view admin accounts, change
   roles, with a guard against demoting the last remaining Super Admin),
   `acmeai@Talvyn.com` promoted to `SUPER_ADMIN` (seed + live DB), and
   honest "Coming soon" `Templates`/`Companies` nav items/pages matching a
   user-supplied dashboard mockup that referenced features Talvyn
   doesn't have yet. Live end-to-end smoke-tested against the running dev
   stack (real login, real session, real lockout-guard rejection) — see
   `docs/changelog/super-admin-role.md`. A first, narrow slice of the
   "Enterprise batch" RBAC item below — full resource-ownership/role
   enforcement across destructive operations is still backlog.
2.15. ~~**Transparent logo + favicon redesign:** the logo/favicon had an
   opaque card background that looked fine on white but showed up as a
   pale sticker on the dark sidebar.~~ Shipped — removed the card, dropped
   detail that wouldn't read at favicon size, and recolored the mark's
   gradient to stop at `brand-600` instead of `brand-900` (which is dark
   enough to vanish against the `#312E81` sidebar with no card behind it).
   First real visual verification in this whole rebrand effort: caught
   ImageMagick's SVG delegate silently dropping gradients (a false
   negative), switched to real `google-chrome --headless` screenshots,
   viewed them with the Read tool on dark/light/favicon-size renders and
   the actual live login page, and confirmed genuine pixel-level
   transparency. See `docs/changelog/transparent-logo-redesign.md`.
2.16. ~~**Favicon cache fix + full icon/branding audit:** the favicon
   redesign wasn't showing up in the browser.~~ Shipped — root cause was
   `layout.tsx`'s explicit `metadata.icons` rendering a literal,
   never-changing `/icon.svg` URL instead of letting Next.js's file
   convention auto-hash it; removed the override and confirmed the
   rendered link now carries a content hash that changes whenever the
   file does. Repo-wide audit (not just files remembered from prior
   passes) found one real leftover outside the frontend entirely: the
   candidate invitation email template still hardcoded the old
   pre-rebrand sky-blue — fixed and verified by rendering the actual email
   HTML and screenshotting it. See
   `docs/changelog/favicon-cache-and-icon-audit.md`.
2.17. ~~**Phase F — accessibility + responsive sweep:** the long-deferred
   final phase of the rebrand (keyboard focus, color contrast, responsive
   behavior).~~ Shipped — computed real WCAG contrast ratios and fixed
   every `brand-300`/`400` AI-accent color that failed (confirming the
   exact risk flagged back in Phase E and never checked until now), fixed
   the Sidebar's group-label contrast, and fixed `AdminSearch`'s custom
   focus ring, which was silently winning over the app's solid global
   focus indicator via CSS specificity while itself being nearly invisible
   (~1.2:1). Verified keyboard focus is otherwise already solid app-wide
   and confirmed responsive layout by logging into the live dev stack as
   the real Super Admin and screenshotting the actual authenticated app
   (not a mockup) via headless Chrome + the DevTools Protocol, at mobile
   and desktop widths. Caught and fixed a real bug along the way: most
   System Health rows said "has not run yet" even when healthy with a real
   latency number on screen. See
   `docs/changelog/phase-f-accessibility-responsive-sweep.md`.
2.18. ~~**Admin search "Search failed." fix:** the same symptom reported
   once before, much earlier, against production (attributed at the time
   to a stale backend deploy, never confirmed) — this time reproducible
   against the current build and actually debugged end-to-end.~~ Shipped —
   root cause: `search.ts` requested a trailing-slash URL through the
   catch-all proxy route, which never preserves trailing slashes when
   reconstructing the upstream path, triggering an avoidable browser-level
   308 redirect on every search (confirmed via real Chrome DevTools
   Protocol network capture, not guesswork). Found 3 more API calls with
   the same latent fragility (`candidates.ts`, `webhooks.ts` ×2) and fixed
   all of them. Re-verified live: one request, one 200, zero redirects.
   See `docs/changelog/proxy-trailing-slash-redirect-fix.md`.
2.19. ~~**Dependency vulnerability remediation:** a full system audit flagged
   26 npm vulnerabilities (2 high) and 10 pip vulnerabilities as the top
   fix-order priority.~~ Shipped (everything safely patchable) — removed
   the unused `python-jose` dependency entirely (kills its `pyasn1`/`rsa`
   chain), bumped `pytest`/`pytest-asyncio` to their current majors
   (297/297 tests still pass), bumped `@sentry/nextjs` v8→v10 (migrating
   `sentry.client.config.ts` to Next.js's `instrumentation-client.ts`
   convention before Turbopack drops support for the old file), and forced
   a nested vulnerable `postcss` inside Next.js's own bundle via a scoped
   npm `overrides` entry. npm: 26→2 vulnerabilities (remaining 2 need a
   `next-auth` v4→v5 migration, its own workstream). pip: 10→8 (remaining
   8 are all `starlette`, unfixable without a FastAPI major-version bump —
   every CVE fix version falls outside `fastapi==0.115.6`'s allowed
   range). Along the way, added then reverted an `instrumentation.ts` file
   after discovering it broke the app's "zero overhead when disabled"
   guarantee by bloating the Edge Middleware bundle from 53.5kB to 136kB
   even with Sentry off — Edge Middleware can't code-split a dynamic
   import based on a runtime-only env check. See
   `docs/changelog/dependency-vulnerability-remediation.md`.
2.20. ~~**Per-model prompt registry:** wanted to test `qwen2.5-coder:7b`
   alongside the existing `gemma3` family, which needs different prompt
   tuning, not just a model-name swap.~~ Shipped — `backend/app/prompts/`
   resolves `OLLAMA_MODEL` to a family-tuned `ModelPromptSet` (skill
   extraction, test generation, evaluation, AI detection) via keyword
   match, falling back to the Gemma set for any unrecognised model.
   Refactored all 4 Ollama-calling services to pull prompts from the
   registry instead of hardcoded module constants — verified every Gemma
   prompt is byte-identical to what shipped before, so the default path
   has zero behavior change. Added `start.sh --model <tag>` so a model
   override actually survives the next hardware-detection run instead of
   being silently overwritten. The Qwen prompt set is a reasoned starting
   point (not yet validated against real generations) — its code-eval
   prompt leans into the model's coding specialization with an explicit
   execution-trace step; the other 3 tasks stay close to Gemma's wording.
   See `docs/changelog/ai-prompt-registry.md` and
   `docs/ai-prompt-registry.md`.
2.21. ~~**Dev/prod deployment drift:** user reported that local dev changes
   (env config, docker compose edits) kept causing production errors.~~
   Fixed two confirmed bugs, not just documented around them — production's
   frontend container ran `prisma generate` (client codegen) but never
   `prisma migrate deploy`, so any Prisma schema change (e.g. this batch's
   own `User.isActive` column) would ship as code that crashes at runtime
   against a database missing the new column; and
   `docs/deployment.md`'s "Step 6" production setup instructions told the
   reader to run `./start.sh`, a dev-machine tool that always starts
   `docker-compose.yml` (the dev stack), not `docker-compose.prod.yml`.
   Fixed both: added the missing `prisma migrate deploy` step to
   `docker-compose.prod.yml` (and the equivalent to dev's
   `start-dev.sh`, since the exact same gap had just crash-looped this
   session's own dev container), and corrected Step 6 plus the
   Maintenance/Troubleshooting sections that had the same dev/prod
   conflation (wrong container names, missing `-f docker-compose.prod.yml`,
   a stale credential example). Added a new "Keeping Dev Changes From
   Breaking Production" section explaining the 3 mechanisms together:
   compose-file separation, why env files are git-ignored and the parity
   gap that creates, and the now-fixed automatic migrations. See
   `docs/changelog/dev-prod-deployment-drift-fix.md`.
2.22. ~~**Super Admin: create + deactivate admin accounts:** the Users page
   could only change an existing account's role — its own footer note
   admitted "no self-service sign-up yet."~~ Shipped — added
   `POST /api/admin/users` (create) and `PATCH /api/admin/users/[id]/status`
   (deactivate/reactivate), both Super-Admin-only. Deactivation, not
   deletion, since a hard `DELETE` would fail via FK constraints on any
   admin with real activity (uploaded JDs, sent invitations); a
   deactivated account is blocked at sign-in itself (`auth.ts`), not just
   hidden from the admin UI. Guards: you can never change your own status,
   and the last *active* Super Admin can't be deactivated. Verified live
   against the real running stack via direct API calls (not just code
   review): create → 201, deactivate → 200, reactivate → 200, self-status-
   change → 400, login as a deactivated account → 401 with an empty
   session. Along the way, recovering the local dev Postgres from an
   unrelated stuck-port issue surfaced a real gap this session's own
   `prisma migrate deploy` fix (item 2.21) was built to catch: the
   database's migration history had no record of its own original `init`
   migration at all (this database was first set up via `prisma db push`,
   not tracked migrations) — resolved with `prisma migrate resolve`. See
   `docs/changelog/super-admin-user-lifecycle.md`.
2.23. ~~**`start.sh` interactive model picker:** wanted a discoverable way
   to try Gemma/Qwen/DeepSeek/MiMo without already knowing exact Ollama
   tags, without slowing down the common "just run it" case.~~ Shipped —
   running `./start.sh` from a real terminal now shows a 10-second
   arrow-key menu defaulting to the hardware-recommended pick; no input
   (or pressing Enter on "Auto") behaves exactly like before this change.
   Each family maps to a tag sized for the hardware tier already detected
   that run. Skipped automatically for `--model`, `--no-prompt` (new
   flag), or non-tty stdin (CI/piped/cron). Pure bash — `read -t` polling
   plus ANSI cursor movement to redraw in place, no new dependency.
   Verified with automated PTY-based keypress tests (no-input timeout,
   arrow-navigate-then-Enter, and picking the option that maps to the
   *same* tag as Auto — caught and fixed a missing confirmation message
   in that last case). DeepSeek/MiMo have no tuned prompt set yet, so
   picking them currently falls back to the Gemma-tuned prompts via the
   registry's existing fallback — documented, not a bug. See
   `docs/changelog/start-sh-interactive-model-picker.md`.
3. **Review quality batch:** Skill coverage matrix, question warnings,
   question-level analytics.
4. **Collaboration batch:** Hiring stages, team comments, shareable reports.
5. **Enterprise batch:** RBAC, data retention/export/delete, Playwright E2E.

### Reviewer Checklist For Claude Output

Use this checklist after every Claude implementation:

- Does the feature have a backend model/schema/migration if persistent data was
  added?
- Are permissions enforced on the backend, not only hidden in the UI?
- Does the UI include loading, empty, error, and success states?
- Does the workflow recover cleanly after refresh, deploy, expired session, or
  failed network request?
- Are destructive actions confirmed and audit-logged?
- Are candidate-facing messages plain and non-technical?
- Are admin-facing errors specific enough to fix the problem?
- Are tests added for the highest-risk backend behavior and at least one
  frontend smoke/build check?
- Were docs and this feature checklist updated in the same change?

## Recommended Roadmap Order

1. Stabilize production basics: email domain, stable backend domain, CI/deploy health, and scheduled off-server backups.
2. ~~Add public-link analytics~~ — done: views, registrations, starts, completions, and pass rate now ship on the admin Candidates page. Revisit later for historical trend charts if needed.
3. ~~Add outbound webhooks~~ — done: invite created, test started, test submitted, and evaluation ready now fire signed HTTP events with retry/backoff, configurable in Settings. Next: a thin Zapier/Make layer on top, then ATS-specific apps (Greenhouse/Lever/Ashby).
4. Improve assessment integrity: explicit AI-use policy, plagiarism checks, identity verification options.
5. ~~Add an admin audit log~~ — done: Settings now shows a paginated, actor-attributed trail of invitation revoke/resend, evaluation overrides, and data reset/restore. Expand collaboration further with team comments, shared candidate cards, and hiring-stage pipeline.
6. Decide product direction for coding interviews: either build a real sandbox/live interview product or keep Talvyn focused on generated screening tests.
7. Prepare enterprise readiness: RBAC, tenant model, retention controls, compliance/security packet.
