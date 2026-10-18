# Super Admin: Create + Deactivate Admin Accounts

Date: 2026-06-21

The Users page (`docs/changelog/super-admin-role.md`) could only change an
existing admin's role — its own footer note said "New admin accounts are
created via the backend seed script — there's no self-service sign-up
yet." Added the two real gaps: creating a new admin account from the page,
and deactivating/reactivating one, without touching the schema's only
delete-adjacent option (hard `DELETE`, which would fail on any admin with
real activity via FK constraints on `job_descriptions`/`invitations` —
deactivation is the correct, reversible primitive here, not deletion).

## What changed

- **`prisma/schema.prisma`**: added `User.isActive` (`Boolean @default(true)`).
- **`src/lib/auth.ts`**: `authorize()` now rejects sign-in for a deactivated
  account the same generic way as a wrong password — no distinct error, so
  a deactivated admin can't use the login form to confirm their account
  still exists.
- **`POST /api/admin/users`** (new): creates an admin account. Super-Admin-
  only; validates email uniqueness, hashes the password the same way
  `prisma/seed.ts` does (bcrypt, cost 12).
- **`PATCH /api/admin/users/[id]/status`** (new): toggles `isActive`.
  Super-Admin-only, with two guards: you can never change your own status
  (deactivating yourself is either a no-op until your session expires, or
  locks you out with no guaranteed other Super Admin — simpler to forbid
  outright), and the last *active* Super Admin can't be deactivated (same
  principle as the existing role-change `LAST_SUPER_ADMIN` guard, just
  counting active accounts rather than all accounts — see the code
  comment in `users/page.tsx` for why the two counts are intentionally
  different).
- **`CreateUserForm.tsx` + `AddAdminSection.tsx`** (new): inline expandable
  form (name/email/password/role), matching `InviteForm.tsx`'s existing
  validation/error patterns.
- **`UserStatusToggle.tsx`** (new): deactivate is a confirmed action (via
  the existing `ConfirmDialog`), reactivate isn't — deactivating blocks
  someone from doing their job, reactivating doesn't need the same
  friction.
- **`Sidebar.tsx`**: added a small accent tag on the "Users" nav item for
  Super Admins, visually distinct from the neutral "Soon" tag on
  not-yet-built pages — this page is fully built, just restricted, which
  is a different thing than "not built yet."

## Verification

Live, via direct API calls against the real running stack (not just code
review) — logged in as the seeded Super Admin via a NextAuth credentials
POST, then exercised every path:

- `POST /api/admin/users` → `201`, account created.
- `PATCH .../status {isActive:false}` → `200`, deactivated.
- `PATCH .../status {isActive:true}` → `200`, reactivated.
- `PATCH .../status` on the caller's own id → `400 SELF_STATUS_CHANGE`.
- Login attempt as the deactivated account → `401 CredentialsSignin`,
  empty session — confirms the `auth.ts` gate actually blocks sign-in, not
  just the admin UI.
- `npm run type-check` / `lint` (62-warning baseline, unchanged) / `build`
  all pass; backend suite still 297/297 (unrelated to this change, but
  re-run after the Docker recovery below to confirm nothing else broke).

Did not live-test the last-active-Super-Admin lockout guard against the
real seeded account — the code path is identical to the already-verified
role-change guard, and deliberately not exercised against the one real
Super Admin account on a shared dev database to avoid any risk of actually
locking it out.

## Incident along the way: lost migration, recovered cleanly

Applying the `isActive` column required working around two unrelated
problems with the local Docker/Postgres setup (a stuck `docker-proxy`
process from an unrelated earlier container recreation, blocking
Postgres's usual port) — worth recording since the recovery revealed a
real gap, not just an inconvenience:

1. The `is_active` column, applied directly via `prisma db execute`
   earlier in this session, was **not present** when Postgres finally
   came back up on a new port — same named volume, same real data (the
   seeded admin, real `job_descriptions`/`invitations` rows), but the
   column and the entire `_prisma_migrations` history table were both
   gone. The most likely explanation: a `docker compose run` invocation
   earlier in the session triggered a postgres "Recreate" for unrelated
   reasons; that operation evidently re-applied against the database in a
   state preceding the manual fix, rather than the volume losing data
   outright (the rest of the schema, including features
   shipped well before this session, was all still present and correct).
   Re-ran the same `db execute` + `migrate resolve --applied` once
   Postgres was stable — confirmed via `\d users` afterward.
2. Discovered there was no `_prisma_migrations` table *at all* before this
   — meaning this database's schema was originally established via
   `prisma db push` (schema sync, no migration history), not
   `migrate dev`/`deploy`. The newly-added automatic `prisma migrate
   deploy` step (`docs/changelog/dev-prod-deployment-drift-fix.md`) is
   what actually surfaced this on the very first real run: it found the
   original `init` migration recorded as a failed/never-finished entry and
   correctly refused to proceed (`P3009`) rather than silently continuing
   against an inconsistent history. Resolved with the same
   `migrate resolve --applied` command, since the schema itself was
   already correct — this was a bookkeeping gap, not a data problem.

Both fixes were applied directly to the shared dev database, not just
documented as a future TODO, since leaving the frontend container
crash-looping wasn't an acceptable end state.

## Still Not Done

No audit-log entry for role/status changes (the general admin audit log
covers invitation/evaluation/data-reset actions, not these). No user
deletion — deactivation is the only lifecycle action below "promote to
Super Admin," matching the schema's FK constraints. Postgres is
temporarily published on host port `5440` instead of `5436` in
`docker-compose.yml` (see the inline comment there) until a full reboot
clears the unrelated stuck process holding the old port.
