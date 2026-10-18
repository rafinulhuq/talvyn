# Signup Form — Extended Applicant Fields — Design

Date: 2026-08-04
Status: **Design approved, not yet implemented** — see forthcoming implementation plan under `docs/superpowers/plans/`.
Relates to: `docs/superpowers/specs/2026-07-29-admin-signup-approval-design.md` (the base signup/approval flow this extends), `frontend/prisma/schema.prisma`, `frontend/src/app/api/signup/route.ts`, `frontend/src/components/auth/SignupForm.tsx`, `frontend/src/components/admin/SignupRequestRow.tsx`.

## Purpose

The existing public `/signup` form (companyName, name, email, password) doesn't give a Super Admin
enough information to vet a request before granting `ADMIN` access. This adds four fields —
username, role in company, company website, and a validated international phone number — so the
Access Requests review panel shows a fuller picture of who's asking for access.

This is purely additive to the approval flow already designed and implemented in
`2026-07-29-admin-signup-approval-design.md`: same `PENDING → APPROVED/REJECTED` gate, same
Super Admin-only review panel, approval still only ever grants plain `ADMIN` (never
`SUPER_ADMIN`). Nothing about the gate or the panel's authorization model changes.

## Decisions Made

- **Username is a new, separate field** — not an alias for the existing "Full name" field.
  It's a chosen identifier the applicant picks (e.g. `jsmith`), stored and shown in the review
  panel, but it does **not** become a login credential.
- **Login stays email-only.** No change to `authorize()`, the `/login` form, or NextAuth
  configuration. Username is display/record data.
- **Username is unique**, enforced with the same `409` pattern already used for duplicate email
  (a distinct `USERNAME_TAKEN` error code so the form can point at the right field). This wasn't
  explicitly specified by the requester but was flagged and confirmed: an identifier meant to be
  shown in the review panel is confusing if duplicated.
- **Role in company is free text**, not a fixed dropdown — matches how `companyName` already
  works, no list to design or maintain.
- **Company website is a required, validated URL** — all four new fields are required to submit
  the form (no optional fields in this round), per explicit confirmation.
- **Phone number uses a country-code dropdown + national number input**, combined into a single
  E.164-formatted string (e.g. `+8801712345678`) before submit, validated with `libphonenumber-js`
  both client-side (immediate feedback) and server-side (never trust client-side validation
  alone). This is a new dependency — justified because reliable international phone number
  validation isn't a few lines of regex, and no phone-validation library or country-select
  component already exists in this codebase (confirmed by search).
- **New columns are nullable at the DB level** (`username`, `roleInCompany`, `companyWebsite`,
  `phoneNumber` all `String?`, matching the existing `companyName` pattern) even though the public
  signup form enforces them as required. Existing accounts backfill to `NULL` — nothing reads
  these fields for pre-existing users, so no backfill migration is needed. `username` additionally
  needs a partial-unique constraint that only applies to non-null values, since existing accounts
  won't have one.

## Approaches Considered

| Approach | Verdict |
|---|---|
| **A. Add 4 fields directly to the existing `User` model + signup form/API**, no structural change to the approval flow | **Chosen.** The base flow (Task 1-8 of the prior plan) already has exactly the right shape — a request queue on `User` rows gated by `signupStatus`. This is purely "more columns, more form fields, more review-panel display," not a new subsystem. |
| B. A separate `SignupApplicantProfile` table (1:1 with `User`) holding the new fields | Rejected — same reasoning as the prior design's rejected Approach B: splits data that's only ever read/written together across two tables for no real benefit, since these fields have no independent lifecycle from the `User` row they describe. |
| C. Free-text phone input, no country dropdown, light regex validation only | Rejected per explicit requirement — the requester confirmed they want real validated international numbers via a country selector, not best-effort regex. |

## Architecture

```
frontend/prisma/schema.prisma                       (User gains username, roleInCompany, companyWebsite, phoneNumber)
frontend/src/app/api/signup/route.ts                 (existing — extend zod schema, uniqueness check, validation)
frontend/src/components/auth/SignupForm.tsx          (existing — add 4 new inputs incl. country-code select)
frontend/src/components/admin/SignupRequestRow.tsx   (existing — display the 4 new fields in the review row)
frontend/src/lib/phone.ts                             (new — thin wrapper around libphonenumber-js: validate + format to E.164, country list for the dropdown)
package.json                                          (new dependency: libphonenumber-js)
```

### 1. Data model

```prisma
  username       String?  @unique
  roleInCompany  String?
  companyWebsite String?
  phoneNumber    String?
```

All four nullable at the DB level, same reasoning as the existing `companyName` field — existing
accounts backfill to `NULL`, no behavior change for them. `username`'s `@unique` constraint is
enforced at the DB level; Prisma/Postgres unique constraints already treat multiple `NULL`s as
non-colliding, so pre-existing accounts with `NULL` usernames don't conflict with each other or
with future signups.

### 2. Phone validation helper and complete validation attempts

`frontend/src/lib/phone.ts` wraps `libphonenumber-js`:

```typescript
import { isValidPhoneNumber, parsePhoneNumber, getCountries, getCountryCallingCode } from "libphonenumber-js";

export function toE164(country: string, nationalNumber: string): string | null {
  if (!isValidPhoneNumber(nationalNumber, country as never)) return null;
  return parsePhoneNumber(nationalNumber, country as never).number; // E.164
}

export function countryOptions() {
  return getCountries().map((code) => ({ code, callingCode: `+${getCountryCallingCode(code)}` }));
}
```

Used identically on the client (`SignupForm.tsx`, for immediate feedback before submit) and the
server (`/api/signup/route.ts`, as the actual source of truth — the client check is UX only).

### 3. Signup form (`SignupForm.tsx`)

Four new fields added after the existing four:

- **Username** — text input, same `Input` component pattern as the rest of the form.
- **Role in company** — text input.
- **Company website** — text input, `type="url"`, zod `.url()`.
- **Phone number** — a native `<select>` (styled to match the existing `Input` component's
  classes, no new dependency for the UI itself) populated from `countryOptions()`, next to a text
  input for the national number. On submit, combined via `toE164()`; if `toE164` returns `null`
  (invalid for the selected country), the field shows a validation error and submission is
  blocked client-side — same pattern as the existing zod-driven field errors.

### 4. Signup API (`/api/signup/route.ts`)

The zod schema gains:

```typescript
username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/, "..."),
roleInCompany: z.string().min(1).max(255).trim(),
companyWebsite: z.string().url(),
phoneNumber: z.string(), // already E.164 from the client's toE164() call
```

After the existing email-uniqueness check, add a username-uniqueness check
(`prisma.user.findUnique({ where: { username } })`) → `409 { code: "USERNAME_TAKEN" }` on
collision, mirroring the existing `EMAIL_TAKEN` response exactly. The phone number is re-validated
server-side with `isValidPhoneNumber` on the parsed E.164 string before being persisted — the
client's country-aware validation is UX, not the source of truth.

### 5. Review panel (`SignupRequestRow.tsx`)

The row gains: username (shown next to the existing name/email line), role in company, company
website (rendered as a clickable link, opens in a new tab), and the formatted phone number. Purely
additive display — the Approve/Reject buttons and their `PATCH` call are unchanged, since approval
still only ever sets `signupStatus` and never touches `role`.

## Testing

Extends the existing e2e patterns from the base signup plan (`signup-api.spec.ts`,
`signup-page.spec.ts`) with:

- A full valid submission including all four new fields succeeds (`201`), and the created row has
  all four fields persisted correctly.
- A duplicate `username` (distinct from the existing duplicate-email test) returns `409` with
  `USERNAME_TAKEN`.
- An invalid phone number for the selected country returns `400`.
- An invalid `companyWebsite` (non-URL string) returns `400`.

## Explicitly Out of Scope

- Username-based login (or any change to `authorize()`/NextAuth) — login stays email + password
  only.
- A dropdown/preset list for "role in company" — free text only.
- Making any of the four new fields optional — all required in this round.
- Editing these fields after signup (e.g. an applicant updating their phone number before
  approval) — out of scope, matches the existing flow's "submit once, wait for review" model.
- Verifying the phone number is reachable (SMS/call OTP) — this validates *format* only, not
  ownership.
