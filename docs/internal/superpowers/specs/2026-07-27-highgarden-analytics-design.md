# HighGarden — In-House Site Analytics — Design

Date: 2026-07-27
Status: **Design approved, not yet implemented** — see `docs/superpowers/plans/2026-07-27-highgarden-analytics-plan.md` for the implementation plan.
Relates to: superadmin panel (`frontend/src/app/(admin)/dashboard`), NextAuth session/roles.

## Purpose

Build an in-house, Hotjar-style analytics system called **HighGarden**, visible only inside the
superadmin panel, gated behind a *second* password (distinct from the normal login credentials).
It tracks real visitor interactions (page views, button/link clicks — "which button did a person
press") across the entire product, and gives super admins a dashboard to review that activity.

## Decisions Made

- **v1 scope**: click/event tracking + dashboard only. No visual heatmap overlay, no session
  replay video, no funnels. (Hotjar's full feature set — heatmaps, replay, funnels — is several
  independent subsystems; replay alone is effectively building an rrweb-style recorder/player and
  is explicitly out of scope for v1.)
- **Tracking surface**: the entire site — marketing pages, blog, login, candidate apply/exam flow,
  and the admin dashboard itself. No exclusions for logged-in staff.
- **Session detail**: both aggregate counts (e.g. "Apply button clicked 342 times") *and*
  per-session timelines (drill into one anonymous visitor's chronological event sequence).
- **Auth model for the second password**: one shared passphrase (not per-superadmin), stored as a
  bcrypt hash in an env var, required once per browser session in addition to a normal
  `SUPER_ADMIN` login.
- **Retention**: 90 days of raw events, no aggregation/rollup tables. Purged via a manual admin
  action, not a new cron/scheduler (none exists in this repo yet — see Approaches Considered).
- **Where it lives**: entirely inside the existing Next.js frontend (App Router + Prisma), not the
  separate FastAPI backend.

## Approaches Considered

| Approach | Verdict |
|---|---|
| **A. Native Next.js + Prisma**, new API routes writing directly to the same Postgres DB the admin panel already uses | **Chosen.** Matches the existing pattern (`frontend/src/app/api/admin/*`, `frontend/src/app/api/observability/web-vitals/route.ts` already ingest similarly). No new service, no cross-service hop for every click. |
| B. Route ingestion through the FastAPI backend | Rejected — adds a browser → Next.js → FastAPI → Postgres hop for every click event, plus CORS/auth plumbing, for no benefit since Next already has direct DB access via Prisma. |
| C. Embed a third-party tool (self-hosted PostHog/Plausible) | Rejected — the ask is explicitly a bespoke, fully-controlled system living inside the superadmin panel under the HighGarden name, not an external embedded tool. |
| D. Cron-based retention purge | Rejected for v1 — no scheduler infra exists in this repo. A manual "Purge events older than 90 days" action (same pattern as the existing Settings → Maintenance tab) covers it without adding new infra. Revisit if this becomes a recurring chore. |

## Architecture

```
frontend/prisma/schema.prisma                          (new models: VisitorSession, TrackedEvent, TrackedEventType)
frontend/src/components/tracking/HighGardenTracker.tsx (new — client component, mounted in root layout)
frontend/src/app/api/track/route.ts                    (new — public ingestion endpoint)
frontend/src/app/api/highgarden/unlock/route.ts        (new — passphrase check, sets unlock cookie)
frontend/src/app/(admin)/dashboard/highgarden/          (new — dashboard pages)
  ├─ page.tsx           (overview: stats, top pages, top elements, trend chart)
  ├─ unlock/page.tsx    (passphrase entry screen)
  ├─ sessions/page.tsx  (paginated session list)
  └─ sessions/[id]/page.tsx (single session's chronological event timeline)
frontend/src/components/admin/Sidebar.tsx              (existing — add superAdminOnly nav item)
```

### 1. Data model (new, in `frontend/prisma/schema.prisma`)

```prisma
enum TrackedEventType {
  PAGE_VIEW
  CLICK
}

model VisitorSession {
  id          String   @id @default(cuid())
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @updatedAt
  userAgent   String?
  events      TrackedEvent[]
}

model TrackedEvent {
  id             String   @id @default(cuid())
  sessionId      String
  session        VisitorSession @relation(fields: [sessionId], references: [id])
  type           TrackedEventType
  path           String             // pathname, e.g. /apply/acme-co
  targetLabel    String?            // trimmed visible text / aria-label of clicked element
  targetSelector String?            // stable-ish selector, for grouping clicks on the same element
  createdAt      DateTime @default(now())

  @@index([path, createdAt])
  @@index([sessionId, createdAt])
}
```

No `userId` link — sessions are anonymous-by-cookie. A logged-in admin browsing the dashboard is
just another session, per the "track everything" decision above.

### 2. Tracking script (client)

`HighGardenTracker` — a client component mounted once in the root layout (so it covers every
route, admin included):

- Reads/creates a `hg_sid` cookie (client-generated `crypto.randomUUID()`, 1-year expiry) — the
  anonymous session id. Not httpOnly; it carries no auth weight, it's just a correlation id.
- On route change (`usePathname` effect): `POST /api/track` with `{ type: "PAGE_VIEW", path }`.
- One capture-phase `click` listener on `document`: walks up from `event.target` to the nearest
  `button`, `a`, or `[role="button"]`; takes its trimmed `innerText` (capped length) as
  `targetLabel` and a best-effort selector (`id` if present, else tag + nearest stable
  attribute) as `targetSelector`. Sends `{ type: "CLICK", path, targetLabel, targetSelector }`.
- Uses `navigator.sendBeacon` so it never blocks navigation and degrades silently if blocked
  (adblockers, etc.) — analytics loss is acceptable, breaking the site is not.

### 3. Ingestion endpoint

`POST /api/track` (`frontend/src/app/api/track/route.ts`) — public, no auth (must accept
anonymous candidate/visitor traffic). Validates payload shape and caps string lengths, upserts the
`VisitorSession` by the `hg_sid` cookie value (create on first sight, bump `lastSeenAt`
otherwise), inserts one `TrackedEvent` row. Always returns `204`, even on soft validation
rejection, so a malformed payload never surfaces an error to a real visitor.

**Known gap (accepted for v1)**: no rate-limiting on this endpoint. It's a lazy fire-and-forget
sink; if abuse/flooding is observed in practice, add throttling then rather than building it
speculatively now.

### 4. Access control — the second password

- `/dashboard/highgarden/**` requires **both**:
  1. An existing `SUPER_ADMIN` NextAuth session (same check already used for `Users`/`CMP` nav
     items).
  2. A separate HighGarden passphrase, checked once per browser session.
- The passphrase is a single shared secret (not per-superadmin), stored as a bcrypt hash in an env
  var (`HIGHGARDEN_PASSPHRASE_HASH`), reusing `bcryptjs` (already a dependency — used for
  credential auth already).
- `POST /api/highgarden/unlock` checks the submitted passphrase against the hash; on success sets
  a short-lived signed httpOnly cookie (`hg_unlocked`, few-hour TTL). A layout-level check in
  `frontend/src/app/(admin)/dashboard/highgarden/layout.tsx` redirects to `/unlock` whenever the
  cookie is missing/expired, or the user isn't `SUPER_ADMIN`.
- Wrong passphrase → generic error message. **Known gap (accepted for v1)**: no lockout or
  rate-limiting on repeated attempts.

### 5. Dashboard (new sidebar item, `superAdminOnly`, under the existing "System" nav group)

- **Overview** (`/dashboard/highgarden`): selectable range (7/30/90d) showing total page
  views/clicks, top 10 pages by traffic, top 10 clicked elements by count, and an events-per-day
  trend chart using `recharts` (already a project dependency).
- **Page drill-down**: click counts broken down by element, scoped to one page.
- **Sessions** (`/dashboard/highgarden/sessions`): paginated list — first seen, last seen, event
  count, entry page — per the "aggregate + per-session timelines" decision.
- **Session detail** (`/dashboard/highgarden/sessions/[id]`): chronological list of that session's
  page views and clicks.
- **Maintenance**: a "Purge events older than 90 days" button (deletes `TrackedEvent`/orphaned
  `VisitorSession` rows past the retention window), following the existing Settings → Maintenance
  tab pattern rather than new scheduler infra.

## Explicitly Out of Scope for v1

- Visual heatmap overlay (click-density rendered on a page screenshot).
- Session replay / video-style playback.
- Funnels / conversion-path analysis.
- Per-superadmin individual passphrases (shared secret only).
- Rate-limiting or lockout on `/api/track` and `/api/highgarden/unlock`.
- Automated (cron-based) retention purge.

Any of the above can be layered on later without reworking the schema or ingestion path chosen
here (e.g. `x`/`y` click coordinates could be added to `TrackedEvent` later for heatmaps without a
breaking migration).
