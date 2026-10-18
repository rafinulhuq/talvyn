# Plan: adding a `USER` role

> **Status:** Proposed (2026-08-05). Planning only — not yet implemented.
> Product decisions below were confirmed with the stakeholder; the
> USER↔ADMIN feature line is the main tunable still open for review.

## Decisions locked

- **`USER` = full hiring operator, across all JDs, minus the org-admin/System area.**
- **Public `/signup` defaults new accounts to `USER`** (pending approval). Super
  Admins approve, and can later promote `USER → ADMIN`. Admins are only
  created/promoted by Super Admins.
- **Only Super Admins review/approve signups** — already true today (the
  Users / Access-Requests surface is Super-Admin-only).

## Current state (what already exists)

- **Roles:** only `ADMIN` and `SUPER_ADMIN` (`backend/app/db/models/enums.py`
  `Role`, mirrored in `schema.prisma` `enum Role`). `Role` is a **native
  Postgres enum type** (`Enum(Role, name="Role", create_type=False)`).
- **Signup + approval:** public `/signup`
  (`frontend/src/app/api/signup/route.ts`) creates a user with `role=ADMIN`,
  `signupStatus=PENDING`. Login (`frontend/src/lib/auth.ts` `authorize`) is
  blocked unless `signupStatus === "APPROVED"` and `isActive`. Super Admin
  reviews pending requests and approves/rejects.
- **Enforcement today:** the backend gates only *maintenance/trash* on
  `SUPER_ADMIN` (`require_superadmin_actor` in `app/dependencies.py`,
  re-checked server-side via `X-Actor-Id`). **Every other feature route**
  (JDs, tests, candidates, results, invitations) is open to any authenticated
  session — there is no per-feature role gate yet. The frontend hides System
  items via a binary `superAdminOnly` flag in `Sidebar.tsx`.

Implication: adding `USER` introduces the platform's **first genuinely
restricted role**, which requires real per-feature permission gating on both
the frontend and (critically) the backend.

## The USER ↔ ADMIN boundary

Because `USER` is a full operator and today's `ADMIN` is *also* "operator minus
the Super-Admin System area", they would overlap. The proposed gradient draws
the line at **workspace configuration**:

| Tier | Mental model | Gets |
|------|--------------|------|
| **USER** (new default) | *Operate* the pipeline | Dashboard, JDs, Candidates, Results, Invitations, Leaderboard, AI Checker |
| **ADMIN** | Operate **+ configure** the workspace | everything USER has **+ Settings** (general/webhooks/integrations), Templates, Companies |
| **SUPER_ADMIN** | Operate + configure **+ govern** | everything ADMIN has **+ Users/approvals, Trash, CMS/CMP, backup/restore/audit** |

- **USER ↔ ADMIN boundary** = the Settings / configuration surface.
- **ADMIN ↔ SUPER_ADMIN boundary** = governance (unchanged from today).

## Feature & permission matrix

| Area / action | USER | ADMIN | SUPER_ADMIN |
|---|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ |
| Job Descriptions — upload, generate, regenerate, delete | ✅ | ✅ | ✅ |
| Candidates — view, soft-delete | ✅ | ✅ | ✅ |
| Results / Reports (incl. JD DOCX export) | ✅ | ✅ | ✅ |
| Invitations — send / bulk invite | ✅ | ✅ | ✅ |
| Leaderboard, AI Checker | ✅ | ✅ | ✅ |
| Settings — general, webhooks, integrations | ❌ | ✅ | ✅ |
| Templates, Companies (when built) | ❌ | ✅ | ✅ |
| CMS / CMP (site content, blog) | ❌ | ❌ | ✅ |
| Users — management **& signup approvals** | ❌ | ❌ | ✅ |
| Trash — restore / purge | ❌ | ❌ | ✅ |
| Settings — Maintenance / Backup / Restore / Audit log | ❌ | ❌ | ✅ |

The `USER` row is the tunable part — any single feature can slide across the
USER↔ADMIN line later. Every ❌ **must be enforced server-side**, not just
hidden in the sidebar (see Security).

## User journey (lifecycle)

1. **Sign up** at `/signup` (same form, same fields) → account created with
   `role=USER`, `signupStatus=PENDING`.
2. **Login blocked** — the existing gate (`signupStatus !== "APPROVED"`) shows
   "pending approval". No change needed.
3. **Super Admin reviews** in Users → Access Requests, sees the request labeled
   **User**, and **Approves** (or Rejects). Optionally an "approve as Admin"
   shortcut to promote in one step.
4. **Approved User logs in** → lands on Dashboard → runs the pipeline: upload
   JD → generate tests → invite candidates → review results/leaderboard →
   export reports.
5. **Ongoing governance** (Super Admin): promote `USER→ADMIN`, deactivate, or
   soft-delete via the existing Users page.

## Implementation plan

### 1. Schema (Alembic owns — then mirror Prisma; see docs/schema-authority.md)
- Add `USER = "USER"` to `Role` in `backend/app/db/models/enums.py`.
- Alembic migration: `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'USER'`. Native
  PG enum — a newly added value can't be *used* in the same transaction it's
  added, so keep it isolated in its own migration.
- Mirror `USER` into `enum Role` in `schema.prisma`; run `npm run db:generate`.

### 2. Backend authorization (the security-critical work)
- Add a **role-rank helper + dependencies** modeled on
  `require_superadmin_actor`: e.g. `require_min_role(ADMIN)` /
  `require_min_role(SUPER_ADMIN)` that resolve `X-Actor-Id` → user → rank and
  re-check server-side.
- Apply `require_min_role(ADMIN)` to the **config routes** (settings, webhooks,
  templates, companies). Workflow routes stay open to any approved active
  session (USER+).
- This is the biggest item: most feature routes currently check only
  `VerifiedInternal`, so the USER-forbidden ones need explicit role gates.

### 3. Signup default
- `frontend/src/app/api/signup/route.ts`: change `role: Role.ADMIN` →
  `role: Role.USER`. Everything else in the signup/approval flow already works.

### 4. Frontend gating
- Replace the binary `superAdminOnly` sidebar flag with a **`minRole`** scheme
  (`USER | ADMIN | SUPER_ADMIN`); tag each nav item. The session already
  carries `role`.
- Add **route guards** (admin layout / middleware) so a USER hitting
  `/dashboard/settings` (etc.) is redirected, not merely missing the link.

### 5. Approval / role UI
- `UserRoleSelect` + the role-change route: add `USER` as an option.
- Access Requests panel: show the requested role; optional "approve as Admin".

## Security note

Hiding a sidebar item is **not** an authorization boundary — the platform
already enforces this for the Super-Admin maintenance routes (server-side
re-check via `X-Actor-Id`). Every feature a USER must not reach has to
**re-check role on the backend**. Because today's workflow routes trust any
authenticated session, the audit of "which routes need a role gate" is the core
security task of this change.

## Rollout / migration concerns

- **Existing users unaffected** — all current accounts are `ADMIN`; only *new*
  signups become `USER`.
- Native PG enum `ALTER TYPE ADD VALUE` is effectively one-way (a value can't be
  cleanly dropped) — note it in the migration.
- CI's `schema-drift` job will confirm the Prisma `Role` mirror matches once
  both are updated.

## Rough sequencing

1. Schema (enum + migration + Prisma mirror) — small.
2. Backend `require_min_role` + gate the config routes — **medium, security-critical**.
3. Signup default flip — tiny.
4. Frontend `minRole` sidebar + route guards — medium.
5. Approval/role UI (`USER` option) — small.
6. Tests: a USER is 403'd from Settings/webhooks; a USER can run the full
   JD→invite→results flow; signup creates a USER-pending account.

## Open decisions

1. **Confirm the USER↔ADMIN line** = "Settings + Templates/Companies" (USER
   can't configure the workspace). Slide individual features if desired.
2. Whether to add an "approve-and-promote-to-Admin" shortcut in Access Requests
   or keep approval and role-change as two steps.
