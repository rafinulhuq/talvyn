# Admin Signup + Super Admin Approval — Design

Date: 2026-07-29
Status: **Design approved, not yet implemented** — see `docs/superpowers/plans/2026-07-29-admin-signup-approval-plan.md` for the implementation plan.
Relates to: `frontend/src/lib/auth.ts` (NextAuth), `frontend/src/app/(admin)/dashboard/users/page.tsx` (existing admin management).

## Purpose

Let a company self-register for an admin account (to try Talvyn's hiring workflow) via a public
signup form, without granting access until a Super Admin explicitly approves the request. This
replaces "give someone to test the admin panel" with a self-service request queue instead of a
Super Admin manually creating an account for every prospective company up front.

## Decisions Made

- **No new role tier.** An approved signup becomes a normal `ADMIN` — same capabilities as any
  admin account created today via the existing "Add Admin" form, no restrictions, no usage caps,
  no expiry (per the owner: "this is an open source project... there will be no limits or
  trials").
- **No per-company data isolation.** Confirmed no sensitive data currently exists in this
  environment, so approved signups see the same shared workspace every admin already sees today
  (see `backend/app/api/v1/jd.py:148-158` — `list_jds` has no per-user/company filter). Building
  real multi-tenant isolation is a separate, much larger project or the future "Companies" feature
  (currently `soon: true` in `Sidebar.tsx`) — explicitly out of scope here.
- **Approval gate**: a new `signupStatus` field (`PENDING` / `APPROVED` / `REJECTED`) on `User`,
  independent of the existing `isActive` flag. `isActive` remains "deactivate an existing approved
  admin"; `signupStatus` is "was this account's creation approved in the first place."
- **Company name**: captured as a plain `companyName` string field on `User` for display in the
  approval queue — not a real `Company` entity/relation. That's the bigger multi-tenant project;
  this is just a label.
- **Notification**: in-app only — a pending-request count badge on the Users sidebar nav item,
  visible to Super Admins. No email dependency (this is open source; self-hosters may not have
  SMTP/Resend configured).
- **Rejection**: rejected requests are kept (`signupStatus: REJECTED`), not deleted, so a Super
  Admin can approve them later without the applicant re-registering.
- **Rate limiting**: the public signup endpoint is rate-limited by IP (new in-memory limiter,
  mirroring the existing `frontend/src/lib/auth/loginRateLimit.ts` pattern) to deter spam. No
  CAPTCHA or email verification for v1.

## Approaches Considered

| Approach | Verdict |
|---|---|
| **A. `signupStatus` field on the existing `User`/`Role` model**, gated at NextAuth's `authorize()` | **Chosen.** Smallest change: reuses the exact existing admin-account data model and login path, just adds one more precondition to sign-in (alongside the existing `isActive` check). |
| B. New `PendingSignup` table, separate from `User`, promoted to a real `User` row on approval | Rejected — doubles the data model (two tables to keep in sync, a promotion step that copies fields across) for no real benefit over a status field on `User` directly. |
| C. Full multi-tenant `Company` entity with per-company data scoping, signup creates a `Company` + first `ADMIN` user | Rejected for now — confirmed no sensitive data exists yet, so isolation isn't a blocking requirement. This is the right shape for the future "Companies" feature, but is a substantially larger project (touches every JD/candidate/test query) that shouldn't be bundled into an access-request queue. |

## Architecture

```
frontend/prisma/schema.prisma                                  (new enum SignupStatus; User gains companyName, signupStatus)
frontend/src/lib/auth.ts                                        (existing — add signupStatus gate in authorize())
frontend/src/lib/auth/signupRateLimit.ts                        (new — IP-keyed limiter, mirrors loginRateLimit.ts)
frontend/src/app/api/signup/route.ts                            (new — public POST, creates PENDING ADMIN)
frontend/src/app/(auth)/signup/page.tsx                          (new — public signup page)
frontend/src/components/auth/SignupForm.tsx                     (new — client form component)
frontend/src/app/api/admin/users/[id]/signup-status/route.ts    (new — Super Admin approve/reject)
frontend/src/components/admin/SignupRequestRow.tsx               (new — Approve/Reject row UI)
frontend/src/app/(admin)/dashboard/users/page.tsx                (existing — add "Access Requests" section, filter main list to APPROVED)
frontend/src/app/(admin)/layout.tsx                              (existing — compute pending count, pass to Sidebar)
frontend/src/components/admin/Sidebar.tsx                        (existing — render pending-count badge on "Users" nav item)
frontend/src/app/(auth)/login/page.tsx                           (existing — add a "Sign up" link)
```

### 1. Data model (new, in `frontend/prisma/schema.prisma`)

```prisma
enum SignupStatus {
  PENDING
  APPROVED
  REJECTED
}
```

`User` gains:

```prisma
  companyName  String?
  signupStatus SignupStatus @default(APPROVED)
```

The `@default(APPROVED)` means every existing row (seeded admins, accounts created via the current
"Add Admin" form) backfills to `APPROVED` on migration — no behavior change for any existing
account, and no change needed to the existing admin-creation route.

### 2. Public signup

`/signup` — a public page, structurally the same unauthenticated shell as `/login` (logo, card),
with a form: company name, contact name, email, password. Submits to `POST /api/signup`, which:

- Rejects if the IP has exceeded the rate limit (new `signupRateLimit.ts`, same shape as
  `loginRateLimit.ts` but keyed by IP instead of email, since there's no existing account yet to
  key on).
- Validates the body with `zod` (company name, name, email, password — same length/format rules
  as the existing `createUserSchema` in `frontend/src/app/api/admin/users/route.ts`).
- Rejects a duplicate email with 409, same as the existing admin-creation route.
- Hashes the password with `bcryptjs` (cost 12, matching existing usage).
- Creates the `User` with **`role` hardcoded to `ADMIN` server-side** — never read from the
  request body, so a signup request can never grant itself `SUPER_ADMIN` or set its own
  `signupStatus` — and `signupStatus: PENDING`.
- Returns success without logging the account in (`signIn()` is never called from the signup
  form) — the page shows a "request submitted, a Super Admin will review it" message instead of
  redirecting to `/dashboard`.

### 3. Login gate

One added precondition in `frontend/src/lib/auth.ts`'s `authorize()`, placed right after the
existing `isActive` check: if `user.signupStatus !== "APPROVED"`, `authorize()` returns `null` —
the same generic "incorrect email or password" outcome the login form already shows for a wrong
password or a deactivated account. A pending or rejected applicant gets no signal distinguishing
their state from a typo'd password.

### 4. Super Admin approval

The existing `/dashboard/users` page (already gated to `SUPER_ADMIN` — see
`frontend/src/app/(admin)/dashboard/users/page.tsx:25-35`) gains a new **"Access Requests"**
section, rendered above the current admin table, listing every `User` with `signupStatus` in
`(PENDING, REJECTED)`: company name, contact name, email, requested date (`createdAt`), current
status badge, and **Approve**/**Reject** buttons (`SignupRequestRow.tsx`, mirroring
`UserStatusToggle.tsx`'s confirm-and-PATCH pattern). Clicking either calls
`PATCH /api/admin/users/[id]/signup-status` with `{ signupStatus: "APPROVED" | "REJECTED" }` —
a new route mirroring the existing `[id]/status/route.ts` exactly (same auth check, same
`SUPER_ADMIN`-only guard). A previously `REJECTED` request can be re-approved later without the
applicant re-registering, since the row is never deleted.

The main admin table below is unchanged in layout, but its query now filters to
`signupStatus: "APPROVED"` only, so pending/rejected rows don't show up there too.

### 5. In-app notification

`frontend/src/app/(admin)/layout.tsx` already computes one async value (`systemStatus`, from a
health check) and passes it down to `AdminShell`/`Sidebar` as a prop — this reuses that exact
pattern: a second `prisma.user.count({ where: { signupStatus: "PENDING" } })` call, passed down as
a `pendingSignupCount` prop. `Sidebar.tsx` renders a small count badge next to the "Users" nav
item (already `superAdminOnly`) when the count is greater than zero — visually similar to the
existing "Soon"/"Super" tags already on nav items, just a number instead of text.

## Explicitly Out of Scope

- A new role tier distinct from `ADMIN`/`SUPER_ADMIN`.
- Usage limits, quotas, or time-based expiry on approved accounts.
- Per-company data isolation / multi-tenancy (the bigger, separate "Companies" project).
- Email notifications to Super Admins or applicants (approve/reject is silent beyond the in-app
  badge and the applicant simply being able to log in or not).
- CAPTCHA or email verification on the signup form.
- Deleting rejected signup requests.
