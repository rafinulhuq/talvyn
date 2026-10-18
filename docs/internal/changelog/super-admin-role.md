# Super Admin Role

Date: 2026-06-21

The user shared a "Talvyn Light Indigo Color System" dashboard mockup and
asked for a Super Admin dashboard, with some nav items staying visible to
regular Admins too. This turned out to be a real, buildable feature: the
`Role` enum (`ADMIN`/`SUPER_ADMIN`) already existed on the `User` model in
both the FastAPI/SQLAlchemy schema and the Prisma schema, and NextAuth
already plumbed `role` through to `session.user.role` — but nothing in the
app actually read it. This is that wiring.

## Decisions Confirmed With The User First

The mockup's sidebar includes "Templates" and "Companies" — neither is a
real Talvyn feature today (no test-template library, no multi-tenant/
company concept; both are roadmap-only per `docs/feature-checklist.md`).
Rather than guess, two things were confirmed before building:

1. **Templates/Companies**: add as real nav items + pages, with an honest
   "Coming soon" empty state — not hidden, not faked with placeholder data.
2. **What Super Admin actually gates**: only a new "Users" page (view/manage
   admin accounts and roles). Everything else (Settings maintenance tools,
   webhooks, etc.) stays available to regular Admins, unchanged.

## What Changed

| Area | Change |
| --- | --- |
| `frontend/prisma/seed.ts` | `acmeai@Talvyn.com` seeded as `SUPER_ADMIN` instead of `ADMIN`. The seed is now self-healing on existing installs too — if a seeded email's row has drifted from the seed list's role, it's corrected on the next seed run instead of being silently skipped. |
| Live database | The already-running dev Postgres had this user seeded as `ADMIN` from before this change — updated directly via SQL so the fix takes effect immediately, not just on the next fresh install. |
| `app/(admin)/layout.tsx` → `AdminShell.tsx` → `Sidebar.tsx` | `session.user.role` is now passed all the way down to the Sidebar. |
| `Sidebar.tsx` | New nav items: **Templates** (Workflow group, `soon: true`), **Companies** (System group, `soon: true`) — visible to everyone, with a small "Soon" tag instead of being a working link to nothing. **Users** (System group, `superAdminOnly: true`) — only rendered when `session.user.role === "SUPER_ADMIN"`. Footer profile block and the `AdminShell` header now show "Super Admin" / "Admin" under the user's name, matching the mockup's role-caption style. |
| `app/(admin)/dashboard/users/page.tsx` (new) | Lists every admin account (name, email, role badge, joined date) with a role-change control. Re-checks the role server-side (not just nav-hiding) since the URL is guessable — non-Super-Admins get a 403-style `ErrorState` instead of the page content. |
| `app/api/admin/users/[id]/role/route.ts` (new) | `PATCH` endpoint backing the role-change control. Re-validates the caller is `SUPER_ADMIN` server-side, validates the target role value, and refuses to demote the last remaining Super Admin (`409 LAST_SUPER_ADMIN`) — without that guard, a Super Admin could accidentally lock everyone out of ever managing roles again. |
| `components/admin/UserRoleSelect.tsx` (new) | Client component for the role dropdown; disabled on a Super Admin's own row when they're the only one. |
| `app/(admin)/dashboard/templates/page.tsx`, `app/(admin)/dashboard/companies/page.tsx` (new) | Honest "Coming soon" `EmptyState` pages — no fabricated data. |

## What Was Deliberately Not Built

- No user creation/deletion UI — there's no self-service admin sign-up
  flow today (accounts are seeded), so "manage roles" was scoped to
  exactly that: changing an existing account's role, not full account CRUD.
- No backend (FastAPI) changes. Admin accounts live in the Prisma/NextAuth
  side of the stack, not in the FastAPI/SQLAlchemy domain models the
  backend's internal-token auth pattern covers — so this is entirely a
  Next.js-side feature (Server Component + Route Handler + Prisma).
- The Dashboard page itself wasn't restructured — it already has 4 of the
  mockup's sections (Needs Attention, Candidate Pipeline, Recent Activity,
  Top Roles by Completion Rate) from the Phase A rebuild, all backed by
  real data, and isn't role-gated per the user's explicit choice. A literal
  date-range picker and "AI Insights" panel from the mockup were not added
  — there's no backend support for date-filtered stats or AI-generated
  insight text, and fabricating either would mean either dead UI or made-up
  content.

## Verification

- `npm run type-check`, `npm run lint` (0 errors, 62-warning baseline),
  `npm run build` all pass.
- **Live end-to-end smoke test** against the running dev stack (this repo's
  `docker-compose.yml` was already up): logged in as
  `acmeai@Talvyn.com` via the real NextAuth credentials flow, confirmed
  `session.user.role === "SUPER_ADMIN"`, confirmed `/dashboard/users`
  renders the account with a "Super Admin" badge, confirmed the Sidebar
  renders Users/Templates/Companies with the right gating, and confirmed
  the role API correctly returns 401 with no session and 409
  `LAST_SUPER_ADMIN` when attempting to self-demote the only Super Admin.
- Not exercised: the "hidden from a regular Admin" path, since there's
  currently only one seeded admin account — the code was reviewed (a
  straightforward `.filter()` on `superAdminOnly`) but not observed live
  against a second, non-Super-Admin session.
