# Frontend contract inventory (pre-rebuild snapshot)

Captured 2026-11-23 from `main` @ `c2f312f`, before the old frontend was deleted on `frontend-rebuild`.
The old source stays readable: `git show main:frontend/<path>`, or `git ls-tree -r main --name-only frontend/`.
The rebuild must keep **every** route and API-route behavior listed here, unless a deviation is written down and approved.

## 1. Page routes (53)

```
/
/(admin)/dashboard
/(admin)/dashboard/ai-checker
/(admin)/dashboard/ats-checker
/(admin)/dashboard/candidates
/(admin)/dashboard/candidates/[id]
/(admin)/dashboard/cmp
/(admin)/dashboard/cms
/(admin)/dashboard/companies
/(admin)/dashboard/exam-results/[examAttemptId]
/(admin)/dashboard/highgarden
/(admin)/dashboard/highgarden/alerts
/(admin)/dashboard/highgarden/feedback
/(admin)/dashboard/highgarden/funnels
/(admin)/dashboard/highgarden/heatmaps
/(admin)/dashboard/highgarden/sessions
/(admin)/dashboard/highgarden/sessions/[id]
/(admin)/dashboard/highgarden/unlock
/(admin)/dashboard/jds
/(admin)/dashboard/jds/[id]
/(admin)/dashboard/jds/[id]/candidates
/(admin)/dashboard/jds/[id]/invite
/(admin)/dashboard/jds/[id]/question-bank
/(admin)/dashboard/jds/[id]/question-bank/candidates
/(admin)/dashboard/jds/[id]/tests
/(admin)/dashboard/jds/[id]/tests/[testId]
/(admin)/dashboard/jds/[id]/tests/[testId]/preview
/(admin)/dashboard/jds/upload
/(admin)/dashboard/leaderboard
/(admin)/dashboard/profile
/(admin)/dashboard/results
/(admin)/dashboard/results/[attemptId]
/(admin)/dashboard/results/by-jd
/(admin)/dashboard/results/jd/[jdId]
/(admin)/dashboard/results/leaderboard/[jdId]
/(admin)/dashboard/results/report/[jdId]
/(admin)/dashboard/settings
/(admin)/dashboard/templates
/(admin)/dashboard/trash
/(admin)/dashboard/users
/apply/[slug]
/(auth)/forgot-password
/(auth)/login
/(auth)/reset-password
/(auth)/signup
/blog
/blog/[slug]
/exam/session
/exam/session/section
/test/complete
/test/expired
/tests/session
/tests/session/exam
```

Route groups: `(admin)` = dashboard behind a NextAuth session; `(auth)` = login/signup/password. `/tests/*`, `/test/*`, `/exam/*` and `/apply/*` are candidate-facing (magic-link token, no session). `middleware.ts` splits www (landing + blog) from app (everything else) when `HOST_SPLIT_ENABLED`.

## 2. Next.js API routes (the server layer)

Auth signals are grepped from each file. `cmp/media` re-exports the `cms/media` handlers.

| Route | Methods | Auth / data signals |
|---|---|---|
| `/api/admin/users/[id]/password` | POST | getServerSession prisma.user RateLimit  |
| `/api/admin/users/[id]/restore` | POST | getServerSession prisma.user  |
| `/api/admin/users/[id]/role` | PATCH | getServerSession prisma.user  |
| `/api/admin/users/[id]` | DELETE | getServerSession prisma.user  |
| `/api/admin/users/[id]/signup-status` | PATCH | getServerSession prisma.user  |
| `/api/admin/users/[id]/status` | PATCH | getServerSession prisma.user  |
| `/api/admin/users` | POST | getServerSession prisma.user  |
| `/api/ai-checker/extract` | POST | getServerSession INTERNAL_API_SECRET  |
| `/api/ats/extract` | POST | getServerSession INTERNAL_API_SECRET  |
| `/api/auth/[...nextauth]` |  |  |
| `/api/candidate/[...path]` | GET,POST | INTERNAL_API_SECRET  |
| `/api/cmp/media/[id]` |  |  |
| `/api/cmp/media` |  |  |
| `/api/cms/media/[id]` | GET |  |
| `/api/cms/media` | POST | getServerSession INTERNAL_API_SECRET  |
| `/api/highgarden/exports/[kind]` | GET | prisma.evaluation prisma.highgardenFeedback prisma.invitation prisma.jobDescription prisma.testAttempt prisma.trackedEvent prisma.user prisma.visitorSession  |
| `/api/highgarden/feedback` | POST | prisma.highgardenFeedback prisma.visitorSession  |
| `/api/highgarden/lock` | POST | HIGHGARDEN  |
| `/api/highgarden/unlock` | POST | getServerSession HIGHGARDEN  |
| `/api/highgarden/verify-otp` | POST | getServerSession HIGHGARDEN  |
| `/api/jd/generate` | POST | getServerSession INTERNAL_API_SECRET  |
| `/api/jd/[id]/analyze` | POST | getServerSession INTERNAL_API_SECRET  |
| `/api/jd/upload` | POST | getServerSession INTERNAL_API_SECRET  |
| `/api/observability/web-vitals` | POST |  |
| `/api/password/forgot` | POST | RateLimit  |
| `/api/password/reset` | POST | RateLimit  |
| `/api/proxy/[...path]` | GET,POST,PATCH,PUT,DELETE | currentSessionUser getServerSession getToken INTERNAL_API_SECRET  |
| `/api/public/[...path]` | GET,POST | INTERNAL_API_SECRET  |
| `/api/signup` | POST | prisma.user RateLimit  |
| `/api/track` | POST | prisma.trackedEvent prisma.visitorSession  |
| `/api/users/[id]/avatar` | GET | getServerSession INTERNAL_API_SECRET  |
| `/api/users/me/avatar` | POST,DELETE | getServerSession INTERNAL_API_SECRET  |

Known behaviors that must be preserved (verify each against the old source in Phase 2):
- `/api/proxy/[...path]`: `getToken` + `currentSessionUser` check. Attaches `X-Internal-Token` and `X-Actor-Id`/`X-Uploader-Id`/`X-Inviter-Id` = `token.sub`. Blocks `/api/v1/internal/*` (**fix: normalize the path and reject dot segments**). Body caps are 2 MB, or 50 MB for `/admin/restore-data`. Long timeout (600s) for the generate/regenerate/evaluation-trigger/ai-checker/question-bank paths. SSE passthrough for `*/stream`. Binary passthrough for `*/export`. 204/205 are remapped to 200 `{}`.
- `/api/candidate/*` and `/api/public/*`: proxies with no session (token-based) that attach the internal token.
- `/api/signup`, `/api/password/*`, `/api/admin/users/*`: write through Prisma to `users`, and are rate-limited (`src/lib/auth/*RateLimit.ts`).
- `/api/track`, `/api/highgarden/*`: Highgarden analytics, stored via Prisma. Unlock uses `HIGHGARDEN_PASSPHRASE_HASH`, `HIGHGARDEN_COOKIE_SECRET` and an OTP.
- `next.config.ts`: security headers (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS, …) and `images.remotePatterns` derived from `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL`. Sentry wraps the config.

## 3. Backend endpoints the old frontend references (127)

These are string literals grepped from `frontend/src`, with `{p}` = an interpolated value. Some are prefixes built dynamically.

```
/api/v1/...
/api/v1/admin/audit-log
/api/v1/admin/backup
/api/v1/admin/highgarden-alerts/send
/api/v1/admin/highgarden-otp/confirm
/api/v1/admin/highgarden-otp/send
/api/v1/admin.py
/api/v1/admin/reset-data
/api/v1/admin/restore-data
/api/v1/admin/webhooks
/api/v1/admin/webhooks/{p}
/api/v1/admin/webhooks/{p}/deliveries
/api/v1/admin/webhooks/{p}/test
/api/v1/ai-checker/check
/api/v1/ai-checker/extract
/api/v1/ai-checker/jobs
/api/v1/ai-checker/jobs/{p}
/api/v1/ats/check
/api/v1/ats/extract
/api/v1/attempts/{p}/answer
/api/v1/attempts/{p}/bulk-save
/api/v1/attempts/{p}/event
/api/v1/attempts/{p}/heartbeat
/api/v1/attempts/{p}/state
/api/v1/attempts/{p}/submit
/api/v1/attempts/{p}/terminate
/api/v1/attempts/start
/api/v1/candidate-exams/{p}/current
/api/v1/candidate-exams/{p}/section/{p}/submit
/api/v1/candidate-exams/{p}/status
/api/v1/candidate-exams/{p}/submit
/api/v1/candidate-exams/start
/api/v1/candidates
/api/v1/candidates/{p}
/api/v1/candidates/{p}/attempts
/api/v1/cmp
/api/v1/cmp/media
/api/v1/cmp/media/${encodeURIComponent
/api/v1/cmp/public/blog
/api/v1/cmp/public/blog/${encodeURIComponent
/api/v1/cmp/public/content
/api/v1/evaluation/inbox
/api/v1/evaluation/leaderboard${qs
/api/v1/evaluation/leaderboard/{p}
/api/v1/evaluation/{p}
/api/v1/evaluation/{p}/export
/api/v1/evaluation/{p}/override
/api/v1/evaluation/{p}/question-score
/api/v1/evaluation/{p}/summary
/api/v1/evaluation/system-report/{p}
/api/v1/evaluation/system-report/{p}/export
/api/v1/evaluation/trigger
/api/v1/exam-admin
/api/v1/exam-admin/attempts/{p}/report
/api/v1/exam-admin/attempts/{p}/report${deepReview
/api/v1/exam-admin/attempts/{p}/retry-evaluation
/api/v1/exam-admin/jd/{p}/candidates
/api/v1/exam-admin/jd/{p}/results
/api/v1/exams.py
/api/v1/health
/api/v1/health/models
/api/v1/health/ready
/api/v1/internal/emails
/api/v1/internal/emails/{p}
/api/v1/internal_emails.py
/api/v1/internal/emails/signup-decision
/api/v1/internal/emails/signup-request
/api/v1/invitations
/api/v1/invitations/bulk
/api/v1/invitations/bulk.
/api/v1/invitations/jd/{p}
/api/v1/invitations/{p}
/api/v1/invitations/{p}/resend
/api/v1/invitations/{p}/revoke
/api/v1/invitations/validate/${encodeURIComponent
/api/v1/invitations/validate/{p}
/api/v1/invitations/validate/{token}
/api/v1/jd
/api/v1/jd/generate
/api/v1/jd/{id}/analyze
/api/v1/jd/{jd_id}/question-bank
/api/v1/jd/{jdId}/status
/api/v1/jd/{p}
/api/v1/jd/{p}${force
/api/v1/jd/{p}/analyze
/api/v1/jd/{p}/question-bank/config
/api/v1/jd/{p}/question-bank/generate
/api/v1/jd/{p}/question-bank/progress/stream
/api/v1/jd/{p}/question-bank/regenerate
/api/v1/jd/{p}/question-bank/review
/api/v1/jd/{p}/question-bank/status
/api/v1/jd/{p}/regenerate
/api/v1/jd/{p}/status
/api/v1/jd/{p}/text
/api/v1/jd/upload
/api/v1/public-links/jd/{p}
/api/v1/public-links/{p}
/api/v1/public-links/{p}/analytics
/api/v1/public-links/{p}/register
/api/v1/public-links/resolve/{p}
/api/v1/search
/api/v1/stats
/api/v1/stats/attention
/api/v1/stats/completions
/api/v1/stats/pipeline
/api/v1/stats/roles
/api/v1/stats/timeline
/api/v1/templates
/api/v1/templates/{p}
/api/v1/templates/{p}/archive
/api/v1/tests
/api/v1/tests/bulk-delete
/api/v1/tests/cancel/{p}
/api/v1/tests/generate/{p}
/api/v1/tests/jd/{p}
/api/v1/tests/{p}
/api/v1/tests/{p}/questions/bulk-delete
/api/v1/tests/{p}/regenerate
/api/v1/tests/progress/{p}/stream
/api/v1/tests/{p}/status
/api/v1/tests/questions/{id}.
/api/v1/tests/questions/{p}
/api/v1/trash
/api/v1/trash/{p}/{p}
/api/v1/trash/{p}/{p}/restore
/api/v1/users/${encodeURIComponent
/api/v1/users/me/avatar
```

## 4. Full backend route table (172 routes)

This is parsed statically from `backend/app/api/v1/*.py` decorators, and it is the authoritative list of what the new frontend may call. **No new endpoints.**

```
GET    /api/v1/health   [health]
GET    /api/v1/health/models   [health]
GET    /api/v1/health/ready   [health]
POST   /api/v1/jd/upload   [jd]
POST   /api/v1/jd/generate   [jd]
PATCH  /api/v1/jd/{jd_id}/text   [jd]
POST   /api/v1/jd/{jd_id}/regenerate   [jd]
GET    /api/v1/jd/   [jd]
GET    /api/v1/jd/{jd_id}   [jd]
GET    /api/v1/jd/{jd_id}/status   [jd]
DELETE /api/v1/jd/{jd_id}   [jd]
POST   /api/v1/jd/{jd_id}/analyze   [jd]
POST   /api/v1/tests/generate/{jd_id}   [tests]
POST   /api/v1/tests/cancel/{jd_id}   [tests]
GET    /api/v1/tests/jd/{jd_id}   [tests]
GET    /api/v1/tests/progress/{jd_id}   [tests]
GET    /api/v1/tests/progress/{jd_id}/stream   [tests]
GET    /api/v1/tests/{test_id}   [tests]
PATCH  /api/v1/tests/{test_id}   [tests]
POST   /api/v1/tests/{test_id}/status   [tests]
POST   /api/v1/tests/{test_id}/regenerate   [tests]
POST   /api/v1/tests/bulk-delete   [tests]
DELETE /api/v1/tests/{test_id}   [tests]
PATCH  /api/v1/tests/questions/{question_id}   [tests]
DELETE /api/v1/tests/questions/{question_id}   [tests]
POST   /api/v1/tests/{test_id}/questions/bulk-delete   [tests]
POST   /api/v1/invitations/   [invitations]
GET    /api/v1/invitations/jd/{jd_id}   [invitations]
GET    /api/v1/invitations/validate/{token}   [invitations]
POST   /api/v1/invitations/bulk   [invitations]
GET    /api/v1/invitations/{invitation_id}   [invitations]
POST   /api/v1/invitations/{invitation_id}/resend   [invitations]
POST   /api/v1/invitations/{invitation_id}/revoke   [invitations]
POST   /api/v1/attempts/start   [attempts]
GET    /api/v1/attempts/{attempt_id}/state   [attempts]
POST   /api/v1/attempts/{attempt_id}/answer   [attempts]
POST   /api/v1/attempts/{attempt_id}/bulk-save   [attempts]
POST   /api/v1/attempts/{attempt_id}/heartbeat   [attempts]
POST   /api/v1/attempts/{attempt_id}/submit   [attempts]
POST   /api/v1/attempts/{attempt_id}/event   [attempts]
POST   /api/v1/attempts/{attempt_id}/terminate   [attempts]
POST   /api/v1/public-links/jd/{jd_id}   [public_links]
GET    /api/v1/public-links/jd/{jd_id}   [public_links]
PATCH  /api/v1/public-links/{link_id}   [public_links]
GET    /api/v1/public-links/{link_id}/analytics   [public_links]
GET    /api/v1/public-links/resolve/{slug}   [public_links]
POST   /api/v1/public-links/{slug}/register   [public_links]
GET    /api/v1/candidates/   [candidates]
GET    /api/v1/candidates/{candidate_id}   [candidates]
GET    /api/v1/candidates/{candidate_id}/attempts   [candidates]
DELETE /api/v1/candidates/{candidate_id}   [candidates]
GET    /api/v1/evaluation/   [evaluation]
GET    /api/v1/evaluation/inbox   [evaluation]
POST   /api/v1/evaluation/trigger   [evaluation]
GET    /api/v1/evaluation/leaderboard   [evaluation]
GET    /api/v1/evaluation/leaderboard/{jd_id}   [evaluation]
GET    /api/v1/evaluation/system-report/{jd_id}   [evaluation]
GET    /api/v1/evaluation/system-report/{jd_id}/export   [evaluation]
GET    /api/v1/evaluation/{attempt_id}   [evaluation]
GET    /api/v1/evaluation/{attempt_id}/summary   [evaluation]
PATCH  /api/v1/evaluation/{attempt_id}/override   [evaluation]
PATCH  /api/v1/evaluation/{attempt_id}/question-score   [evaluation]
GET    /api/v1/evaluation/{attempt_id}/verify-scores   [evaluation]
GET    /api/v1/evaluation/{attempt_id}/similar   [evaluation]
GET    /api/v1/evaluation/{attempt_id}/export   [evaluation]
GET    /api/v1/search/   [search]
GET    /api/v1/admin/backup   [admin]
POST   /api/v1/admin/reset-data   [admin]
POST   /api/v1/admin/restore-data   [admin]
GET    /api/v1/admin/audit-log   [admin]
POST   /api/v1/admin/highgarden-alerts/send   [admin]
POST   /api/v1/admin/highgarden-otp/send   [admin]
POST   /api/v1/admin/highgarden-otp/confirm   [admin]
POST   /api/v1/ai-checker/check   [ai_checker]
POST   /api/v1/ai-checker/jobs   [ai_checker]
GET    /api/v1/ai-checker/jobs/{job_id}   [ai_checker]
POST   /api/v1/ai-checker/extract   [ai_checker]
POST   /api/v1/ats/check   [ats]
POST   /api/v1/ats/extract   [ats]
POST   /api/v1/admin/webhooks/   [webhooks]
GET    /api/v1/admin/webhooks/   [webhooks]
PATCH  /api/v1/admin/webhooks/{subscription_id}   [webhooks]
DELETE /api/v1/admin/webhooks/{subscription_id}   [webhooks]
GET    /api/v1/admin/webhooks/{subscription_id}/deliveries   [webhooks]
POST   /api/v1/admin/webhooks/{subscription_id}/test   [webhooks]
GET    /api/v1/stats/   [stats]
GET    /api/v1/stats/completions   [stats]
GET    /api/v1/stats/attention   [stats]
GET    /api/v1/stats/pipeline   [stats]
GET    /api/v1/stats/timeline   [stats]
GET    /api/v1/stats/roles   [stats]
GET    /api/v1/trash   [trash]
POST   /api/v1/trash/{entity_type}/{item_id}/restore   [trash]
DELETE /api/v1/trash/{entity_type}/{item_id}   [trash]
POST   /api/v1/users/me/avatar   [users]
DELETE /api/v1/users/me/avatar   [users]
GET    /api/v1/users/{user_id}/avatar   [users]
POST   /api/v1/templates/   [exam_templates]
GET    /api/v1/templates/   [exam_templates]
GET    /api/v1/templates/{template_id}   [exam_templates]
PATCH  /api/v1/templates/{template_id}   [exam_templates]
POST   /api/v1/templates/{template_id}/archive   [exam_templates]
DELETE /api/v1/templates/{template_id}   [exam_templates]
GET    /api/v1/cmp/public/content   [cms]
GET    /api/v1/cmp/public/blog   [cms]
GET    /api/v1/cmp/public/blog/{slug}   [cms]
POST   /api/v1/cmp/public/blog/{slug}/clap   [cms]
GET    /api/v1/cmp/documents   [cms]
GET    /api/v1/cmp/documents/{key}   [cms]
PATCH  /api/v1/cmp/documents/{key}   [cms]
POST   /api/v1/cmp/documents/{key}/publish   [cms]
GET    /api/v1/cmp/documents/{key}/versions   [cms]
GET    /api/v1/cmp/documents/{key}/versions/{version}   [cms]
POST   /api/v1/cmp/documents/{key}/restore-version   [cms]
GET    /api/v1/cmp/blog   [cms]
POST   /api/v1/cmp/blog   [cms]
GET    /api/v1/cmp/blog/{post_id}   [cms]
PATCH  /api/v1/cmp/blog/{post_id}   [cms]
POST   /api/v1/cmp/blog/{post_id}/publish   [cms]
POST   /api/v1/cmp/blog/{post_id}/unpublish   [cms]
DELETE /api/v1/cmp/blog/{post_id}   [cms]
GET    /api/v1/cmp/authors   [cms]
POST   /api/v1/cmp/authors   [cms]
PATCH  /api/v1/cmp/authors/{profile_id}   [cms]
DELETE /api/v1/cmp/authors/{profile_id}   [cms]
POST   /api/v1/cmp/media   [cms]
GET    /api/v1/cmp/media/{asset_id}/content   [cms]
GET    /api/v1/cms/public/content   [cms]
GET    /api/v1/cms/public/blog   [cms]
GET    /api/v1/cms/public/blog/{slug}   [cms]
POST   /api/v1/cms/public/blog/{slug}/clap   [cms]
GET    /api/v1/cms/documents   [cms]
GET    /api/v1/cms/documents/{key}   [cms]
PATCH  /api/v1/cms/documents/{key}   [cms]
POST   /api/v1/cms/documents/{key}/publish   [cms]
GET    /api/v1/cms/documents/{key}/versions   [cms]
GET    /api/v1/cms/documents/{key}/versions/{version}   [cms]
POST   /api/v1/cms/documents/{key}/restore-version   [cms]
GET    /api/v1/cms/blog   [cms]
POST   /api/v1/cms/blog   [cms]
GET    /api/v1/cms/blog/{post_id}   [cms]
PATCH  /api/v1/cms/blog/{post_id}   [cms]
POST   /api/v1/cms/blog/{post_id}/publish   [cms]
POST   /api/v1/cms/blog/{post_id}/unpublish   [cms]
DELETE /api/v1/cms/blog/{post_id}   [cms]
GET    /api/v1/cms/authors   [cms]
POST   /api/v1/cms/authors   [cms]
PATCH  /api/v1/cms/authors/{profile_id}   [cms]
DELETE /api/v1/cms/authors/{profile_id}   [cms]
POST   /api/v1/cms/media   [cms]
GET    /api/v1/cms/media/{asset_id}/content   [cms]
POST   /api/v1/jd/{jd_id}/question-bank/generate   [question_banks]
POST   /api/v1/jd/{jd_id}/question-bank/regenerate   [question_banks]
GET    /api/v1/jd/{jd_id}/question-bank/progress   [question_banks]
GET    /api/v1/jd/{jd_id}/question-bank/progress/stream   [question_banks]
GET    /api/v1/jd/{jd_id}/question-bank   [question_banks]
GET    /api/v1/jd/{jd_id}/question-bank/status   [question_banks]
POST   /api/v1/jd/{jd_id}/question-bank/review   [question_banks]
PATCH  /api/v1/jd/{jd_id}/question-bank/config   [question_banks]
POST   /api/v1/candidate-exams/start   [exams]
GET    /api/v1/candidate-exams/{exam_attempt_id}/current   [exams]
POST   /api/v1/candidate-exams/{exam_attempt_id}/section/{section_type}/submit   [exams]
POST   /api/v1/candidate-exams/{exam_attempt_id}/submit   [exams]
GET    /api/v1/candidate-exams/{exam_attempt_id}/status   [exams]
POST   /api/v1/exam-admin/attempts/{exam_attempt_id}/retry-evaluation   [exam_reports]
GET    /api/v1/exam-admin/attempts/{exam_attempt_id}/report   [exam_reports]
GET    /api/v1/exam-admin/jd/{jd_id}/candidates   [exam_reports]
GET    /api/v1/exam-admin/jd/{jd_id}/results   [exam_reports]
POST   /api/v1/internal/emails/signup-request   [internal_emails]
POST   /api/v1/internal/emails/signup-decision   [internal_emails]
POST   /api/v1/internal/emails/password-reset   [internal_emails]
POST   /api/v1/internal/emails/password-changed   [internal_emails]
```

## 5. Environment contract (unchanged)

```
FASTAPI_INTERNAL_URL
HIGHGARDEN_COOKIE_SECRET
HIGHGARDEN_PASSPHRASE_HASH
INTERNAL_API_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_CANDIDATE_API_URL
NEXT_PUBLIC_GLITCHTIP_DSN
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_WEB_VITALS_ENABLED
NODE_ENV
OBSERVABILITY_DEBUG
PUBLIC_APP_URL
VERCEL_URL
```

## 6. Deliberate deviations in the rebuild (Phase 2, 2026-11-23)

The server layer was rewritten with the same contracts. These are the only
intentional behavior changes. Each one tightens security or fixes a bug.

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| `/api/proxy`, `/api/candidate`, `/api/public` | Joined raw catch-all segments; the `/api/v1/internal/*` denylist ran on the un-normalized path | `safeApiPath()` rejects `.`, `..`, empty segments and segments containing `/`, `\` or `%`, then requires the normalized path to equal the joined one | Review issue #1: a dot-segment could bypass the denylist after URL normalization. Covered by e2e tests |
| `/api/public` | Forwarded **all** browser cookies to FastAPI | Forwards only `rp_device_id` | The session and candidate-token cookies were leaking upstream for no reason |
| Login lockout | Keyed on the raw email; DB lookup lowercased | Email normalized before the lockout check | Changing letter case reset the 5-attempt counter |
| Session re-validation | `currentSessionUser` didn't check `deletedAt` | Also rejects soft-deleted users | A removed user's existing session kept working until expiry |
| Last-Super-Admin guards | Role route counted inactive/removed SAs; other routes disagreed | One definition everywhere: role SA, active, not deleted, approved | Could demote the last *active* SA and lock everyone out |
| Admin user mutations | Only the password route had a CSRF check | All admin mutations reject `Sec-Fetch-Site: cross-site` and require JSON | Defense in depth on top of SameSite=Lax |
| Highgarden OTP | Attempt counter lived only in the signed cookie | Also counted server-side per code hash (5 guesses) | Replaying the original cookie gave unlimited guesses |
| Highgarden passphrase | Unlimited attempts | 10 per Super Admin per 15 min | Brute-force bound |
| Signup / admin-created passwords | `min(8)` only | `newPasswordSchema` (8 chars to 72 bytes) | bcrypt silently truncates past 72 bytes |
| `jd/[id]/analyze`, avatar and media `[id]` routes | Raw `id` interpolated into backend URLs | `isSafeId()` allowlist | Path manipulation |
| `/backend/*` rewrite in `next.config` | Exposed FastAPI to the browser without the auth proxy | Removed | Unused, and it bypassed the authenticated layer |
| Server-side GlitchTip | Not wired (Edge middleware bundle size) | `src/instrumentation.ts` (`register` + `onRequestError`), still a no-op without a DSN | `proxy.ts` runs on Node in Next 16, so the constraint is gone |
| Error responses | `500 PROXY_ERROR` when the backend is down | `502 UPSTREAM_UNAVAILABLE` / `504 TIMEOUT` with plain-language messages | Correct status codes; the new UI reads `error.code` |
| Middleware | `src/middleware.ts` with `runtime: "nodejs"` | `src/proxy.ts`, exporting `proxy` | Next 16 rename; `runtime` in proxy throws |

Not ported: the `*.selfcheck.ts` scripts. They're replaced by `tests/unit/*.test.ts`
(`npm run test:unit`) and the API e2e suite (`tests/e2e/api`, which needs
`E2E_DATABASE_URL` pointing at a throwaway DB).

### Phase 3 additions (2026-11-23)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| `/dashboard/docs/[[...path]]` | Decoded path segments were written into an injected `<base href="…">` | Segments restricted to `[A-Za-z0-9._-]`; `..` rejected | Reflected XSS: a crafted docs link could run script on the app origin |
| Brand in app chrome | Full lockup (with tagline and a baked-in "v2.0" badge) at about 20px tall | T mark plus live "TALVYN" wordmark; the full lockup is kept for large placements (`LogoLockup`) | The lockup is unreadable below about 48px. The logo itself is unchanged |
| Sidebar labels | "AI Checker", "ATS Checker", "CMP" | "AI writing check", "Résumé ATS check", "Website content" | Named by what users do. The routes are unchanged |
| "Companies" nav item | Shown with a "soon" badge | Hidden until it does something | No placeholder features in the nav |

Routes missed by the section 1 inventory (they aren't `page.tsx`/`api`), to be rebuilt in Phase 7:
`/blog/feed.xml` (RSS), `/robots.txt` (`robots.ts`), `/sitemap.xml` (`sitemap.ts`).

### Phase 4b additions (2026-11-23)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| Test generation progress | SSE plus a 120-step poll loop with timed fake phase messages ("Generating Practical Reasoning Test…" every 20s) | The SSE stream drives the bar; `/jd/{id}/status` is polled every 5s as the source of truth | No invented progress copy; the backend's own step text is shown |
| Tests list | Archived tests mixed in with live ones | Archived tests hidden, with a count line ("kept for past candidates' results") | Regeneration archives approved tests; they aren't actionable |
| Regenerate warning | Generic confirm | States exactly what happens: drafts replaced, approved tests archived (from `_delete_existing_tests`) | Users should know candidate results are safe |
| Pass mark | Could be cleared in the form, silently ignored by the backend (`None` means "unchanged") | Can be changed but not removed, and the form says so | The backend has no way to unset it |
| Bank-size presets | Labelled "Commercial default" / "Fast / minimum" | "Standard" / "Quick", with counts in the hint | Plain language |
| Question-bank candidates page (`/question-bank/candidates`) | Built in 4b's area | Moved to Phase 4c with the other candidate lists | Same data shape as the candidates screens |

Backend observation (not changed): `_delete_existing_tests` hard-deletes every DRAFT test for the JD, including question-bank section tests (they share `jd_id`). Regenerating the fixed tests while a bank is still a draft would delete the bank's questions. Untested; worth confirming.

### Phase 4c additions (2026-11-23)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| Proxy redirects | axios followed any upstream redirect (default `maxRedirects: 5`), including FastAPI's 307 for `/invitations` → `/invitations/` | Redirects are never followed, except exactly "same path plus trailing slash" (`slashRedirectTarget`); any other 3xx becomes `502 UPSTREAM_REDIRECT` | Following arbitrary redirects with the internal token attached is unsafe; Next strips trailing slashes, so FastAPI collection routes (`POST /invitations/`, `/candidates/`, `/templates/`) still need that one hop |
| Invite page | Three separate components behind a mode switcher | Tabs with the mode in `?mode=` (one person, a list, public link) | Shareable, survives reload |
| Bulk CSV | Parsed client-side, comma or semicolon, header optional | Same rules, plus quoted delimiters, BOM stripping, line numbers in errors, paste as an alternative to a file; unit-tested | |
| Public link limits | Editable; clearing a value was silently ignored by the backend | Can be changed but not removed, and the form says so | Backend treats `null` as "unchanged" |
| Email not sent | Banner with the magic link | Same, shown only when `email_sent` is false and the backend returned the link | |
| Candidate directory search | Client filter | `?q=` sent to `/candidates/?search=`, server-paginated | Works past page 1 |

Local dev DB finding (not changed): `evaluations.mcq_max` and `evaluations.open_ended_max` exist on the ORM model but no Alembic migration adds them; the initial migration builds tables from current metadata, so only databases created before those columns lack them. On such a DB every query loading `Evaluation` 500s (seen on `GET /candidates/{id}/attempts`).

### Phase 5 additions: candidate experience (2026-11-23)

What actually ran in the old frontend, checked against the code (not the comments):

| Mechanism | Old frontend | Rebuild | Why |
|---|---|---|---|
| Timer | `useTestTimer`: `setInterval` decrementing 1/s, heartbeat every 30s, server wins on >30s drift, `force_submit` expires | Same heartbeat and drift rules; counts against a fixed deadline (`useExamTimer`) | A decrementing interval drifts when the tab is throttled; a deadline can't |
| Web-worker timer | `useWebWorkerTimer` + `public/workers/examTimerWorker.js` existed but **were never imported** | Not ported | Dead code |
| Three-strike integrity | `useProgressiveIntegrity` existed but **was never imported** | Not ported | Dead code; the live rule was first-violation termination |
| Integrity rules | `useSuspiciousEvents`: hidden page or window blur ends the attempt; copy/cut/paste, right-click, Ctrl/Cmd+S/P, Ctrl/Cmd+A outside fields blocked and logged (5s per-type rate limit); drag/drop blocked | Identical (`useIntegrity`) | Behavior kept exactly |
| IndexedDB | Every change written (`talvyn_candidate_exam_v1`), **never read back** (`getAllLocalAnswersForAttempt` unused) | Same DB and store names; on resume, records still "dirty" (never confirmed by the server) override the server copy and are re-sent; cleared after a successful submit | Makes the "survives a reload" promise true. Verified: text typed and reloaded within the 2s debounce came back |
| Autosave | Bulk save 2s after typing, every 10s, on reconnect | Same; an answer is only marked clean if it still equals what was sent | |
| MCQ keyboard shortcuts | 1–4 / A–D picked an option even with Ctrl held, so Ctrl+C quietly selected option C | Ignored with Ctrl/Cmd/Alt held | Bug |
| Code answer length | Client allowed 20,000 chars; backend trims every answer to 10,000 | Both inputs stop at 10,000 | No silent truncation |
| Code editor Tab | Tab always inserted spaces (keyboard trap) | Tab indents; Esc then Tab leaves the editor | WCAG 2.1.2 |
| "Answered" count | Any key in the answer map, including untouched starter code | Non-blank, and not identical to the starter code | Accurate unanswered warning |
| Candidate copy | CMP document `candidate_experience`, deep-merged over defaults | Same keys and merge (`mergeCopy`); wrong-typed overrides fall back to defaults; defaults rewritten (no hard-coded "72 hours", since expiry is configurable via `MAGIC_LINK_EXPIRY_HOURS`) | Existing overrides keep working (verified: the stored revoked-link copy rendered) |
| Expiry time | Formatted on the server (server time zone) | Formatted in the candidate's browser time zone | |
| Public link redirect | `router.push('/tests/<token>')` | Full navigation | The proxy must swap the token for the httpOnly cookie |

Verified end to end on the local stack: magic link → cookie → landing → start → MCQ via keyboard → blocked copy logged → instant-reload restore → autosave → submit → "already used" on reopen; a revoked link; window blur → terminate (200) → reload shows the ended screen → link reports ended; public-link registration with validation; timer ticks (1:00:00 → 59:56 in 4s).

Not tested: the sectioned (question bank) exam flow, because `QUESTION_BANK_MODE=false` in the local backend `.env`.

Backend fixes this phase (Alembic, committed separately): `f5b2c8d1e4a9` adds `evaluations.mcq_max/open_ended_max`; `a7c3e9f1b2d4` renames `suspicious_events.metadata` → `event_metadata`. Without the second, on older databases every integrity event and every termination returned 500, so violations were never recorded server-side. A full ORM-vs-database column diff on the dev DB showed no other drift.

### Phase 4d additions: results (2026-11-23)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| Per-role results | Four routes: `/results/by-jd`, `/results/jd/[id]` (invitation list), `/results/leaderboard/[id]`, `/results/report/[id]` | One "Results" tab per job description (`/dashboard/jds/[id]/results`): summary stats, ranking with pass mark on the score scale, AI recommendation spread, common strengths and gaps, Word export. The old URLs 308-redirect there (or to the JD list / candidates tab) | One place per role; no dead bookmarks |
| Results inbox filters | Query string, server-rendered | Same, with role, status, recommendation, integrity and date filters in the URL | |
| Attempt report header | "Evaluation Report" with no candidate context | Candidate name, test, role and email when the link carries `?c=<candidate id>` (all in-app links do); the evaluation endpoint has no candidate fields | Context without a new endpoint |
| Re-score warning | "Re-evaluate" with no warning | Says the reviewer's decision, notes and per-question changes are replaced (`evaluate_attempt` deletes the old evaluation) | It's destructive |
| Recommendation copy | Thresholds in a frontend constant | Same 80/65/45 bands, verified against `_score_to_recommendation`; states the AI can only be more cautious (`_enforce_recommendation`) and that a person decides (`is_preliminary` is always true) | |
| Per-question override | Score input | Inline edit capped at the question's max, "Restore the AI's score" sends `admin_score: null` | |
| Print | `window.print()` printed the app chrome | `@media print` hides the sidebar, header and actions (`data-print="hide"`) | Print-grade reports |
| Exam report | Separate component | `/dashboard/exam-results/[id]`: weighted overall, per-section scale with weights, AI-writing risk with the backend's disclaimer, "Try scoring again" when FAILED | |

Verified on the local stack: the inbox lists submitted, scored and ended attempts; the ended attempt shows the integrity view; "Score this test" scored Ada's real submission with qwen2.5-coder:7b (MCQs 0/9, written 7/10, AI estimate 80% AI-written, flagged); the reviewer decision and notes were saved; the written score was overridden to 8 (totals recalculated to 42%); the Word report downloaded; the role tab, leaderboard and old-URL redirect work; the print view hides the chrome. Not tested: the exam report (needs `QUESTION_BANK_MODE`).

### Phase 6a additions: users, profile, settings (2026-11-23)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| Users page guards | UI counted "last Super Admin" for role changes (all SAs) and "last active" for status | One rule, matching the server (`src/server/admin-users.ts`): the last active Super Admin can't be demoted, deactivated or removed. The protected account can be deactivated, as the server allows | UI and server agree |
| Role-change copy | n/a | "Their access changes straight away", because `currentSessionUser` reads the role from the DB on every request | Accurate |
| Add user | Old form | Dialog with role hints that match real scoping (`owner_scope_for`: USER sees only their own data) | |
| Profile | Picture only, inside Settings | Its own page: picture (5 MB, JPEG/PNG/WebP, the backend's limits), account details, "Email me a password reset link" (the existing forgot-password flow) | |
| Settings overview | Hard-coded facts, some false ("API Proxy /backend", "Invitation Expiry 72 hours") | Removed. The "System health" tab shows live `/health/ready` checks, including the 503 body | No invented facts |
| Webhooks | Same features | Same: create (secret shown once), pause, test event, recent deliveries, delete. Event list = the five events the backend emits | |
| Backup / reset copy | "Hiring data" | States exactly what's included: backup covers website content and exam templates; reset deletes exam templates but keeps website content and accounts (`admin_service._BACKUP_MODELS`/`_RESET_MODELS`) | Destructive actions say what they do |
| Companies | "Coming soon" placeholder page | Redirects to the dashboard (hidden from the nav since Phase 3) | No placeholder features |
| Avatars | `<img>` with onError | Probed after mount; an image that fails before hydration otherwise shows a broken icon | Bug found in testing |

Verified on the local stack: add user, change role, deactivate and reactivate, set password, remove and restore; avatar upload; health tab; webhook create, test event (delivery to example.com recorded as 405, failed), deliveries sheet; backup download; audit log lists the actions; /dashboard/companies redirects. Not run: restore and reset, which are destructive on the dev DB.

### Phase 6b additions: templates, trash, AI writing check, ATS check (2026-11-23)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| Template weights | Sent as typed | Typed as any non-negative numbers, shown as live shares, normalised to sum to 1.0 before sending | The backend rejects weights that don't sum to 1.0 (±0.01): `INVALID_SECTION_WEIGHTS`, found in testing |
| Template lifecycle | Same | Create (ACTIVE), edit, archive, delete; list includes archived | |
| Trash | Same endpoints | Restore and "Delete for good", each stating what's deleted with it (JD → tests, invitations, results; candidate → invitations, answers, results) | Destructive actions say what they do |
| AI writing check | Async job + poll | Same (`/ai-checker/jobs`, 2s poll, up to 6 min); flagged phrases highlighted in the text; the backend's disclaimer is shown verbatim | |
| ATS check | Client WASM extraction, server fallback with OCR | Same; the OCR notice explains why it matters; keyword lists de-duplicated (the backend can repeat keywords) | |
| Shared input | Two copies | One `DocumentInput` (paste or upload; PDF/DOCX via WASM, then the server) | |

Verified on the local stack: template create, edit, archive; candidate to trash and back; ATS check against the analysed Laravel JD (76/100); AI writing check with the real model (about 40s). Not run: "Delete for good" (destructive).

Backend observation (not changed): the ATS check reported "No phone number was found" for a résumé whose first line contains `+44 20 7946 0000`.

### Phase 7a: public site (2026-11-24)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| Homepage copy | Backend defaults (and the old frontend's copy) claimed customer logos (Linear, Vercel…), invented stats ("94.8% offer acceptance"), stock-photo testimonials, "SOC-2 compliant", "keystroke dynamics" | `backend/app/cms/defaults.py` rewritten (`69c6f47`) to describe only what the product does. Logos, stats and testimonials default to empty, and the site hides empty sections. Rafinul chose this on 2026-11-24 | Client-facing claims must be true |
| Headline "highlight" | A second phrase coloured differently | Kept in the content model for compatibility, rendered as part of the same headline | Design rule: no single coloured phrase |
| Hero visual | 3D canvas, dashboard mockup, animated geometry | A sample report built from the product's own components, labelled "Example report. Names and scores are illustrative." | Shows the real product; no fake metrics |
| Section order | CMS `sectionOrder` | Same; unknown and duplicate keys ignored | |
| Blog | Index, post, claps, share, RSS | Same features; markdown rendered without raw HTML (no rehype-raw); external links `noopener`; repeated H1 title stripped | XSS-safe |
| robots / sitemap / feed | CMS "allow indexing" switch | Same behaviour | |
| Candidate copy defaults | Backend defaults said "valid for 72 hours" | Backend defaults now match the frontend copy from Phase 5 | Expiry is configurable |

Two gotchas found here:
- The repo root `.gitignore` has `site/` (MkDocs output), which also matched `frontend/src/components/site/`. Git and Tailwind's source scan both skipped it, so the folder is now `components/marketing/`.
- `mergeCopy` rejected arrays of objects, so CMS lists (steps, features) silently fell back to the defaults. Fixed and unit-tested.

Note for production: `cms_content_documents.draft_json` still holds the old copy (drafts were seeded from the old defaults). Public pages are unaffected (they serve defaults merged with `published_json`), but publishing an old draft from the editor would bring the old claims back. The 7b editor makes the draft visible before publishing.

### Phase 7b: Website content and blog editors (2026-11-24)

| Area | Old behavior | New behavior | Why |
|---|---|---|---|
| CMP editor | Hand-written forms per document (site, home, candidate, email) | One schema-agnostic form that follows the document's own shape, in reading order (the DB returns keys sorted by length), with honest-content notes on the logo, stats and testimonial lists. Icon fields are a picker limited to the backend's allowed icons; media fields can upload | Covers all four documents and any keys added later |
| Stale drafts | Draft shown as-is | If a document was never published and its stored draft differs from what visitors see, the editor says so and offers "Use the live version as the draft" | The drafts still hold the old, unverifiable copy; publishing them would bring it back |
| Publish / history | Same endpoints | Publish confirms; History lists versions and copies one to the draft ("Copy to draft", then publish to roll back) | Matches `restore_version`, which writes to the draft |
| Blog editor | TipTap + tiptap-markdown | Same stack, toolbar (headings, lists, quote, code, divider, link dialog, image upload), word count; cover, author, tags, address, search title and description; Publish now, Schedule (a future `publish_at`), Unpublish, Move to trash | |
| Post address | Fixed at creation ("untitled-post-3") | Follows the title until edited by hand or published | Found in testing |
| `/dashboard/cms` | Redirect | Same redirect | |

New dependencies (named in the approved plan, kept from the old frontend): `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extensions`, `tiptap-markdown`, `react-markdown`, `remark-gfm`.

Gotchas found: `useEditorState` with a not-yet-created editor left the editor blank, so the toolbar now reads state directly with `shouldRerenderOnTransaction`. Plain values exported from `"use client"` modules arrive in server components as client references, so shared constants live in `src/lib/` (DOCS, ROLE_LABEL).

Verified: the homepage document's stale-draft guard, "use live", publish (version 1), and history; the public homepage still serves the honest copy. A post created, written in the editor (paragraph, heading), saved, published, shown on /blog and its page, clapped (count 1), and in the RSS feed. Not run: scheduling, unpublishing, author profiles, cover upload, the link dialog, version restore.
