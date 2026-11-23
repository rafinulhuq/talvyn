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
