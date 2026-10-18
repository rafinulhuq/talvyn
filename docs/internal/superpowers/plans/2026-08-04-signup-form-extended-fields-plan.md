# Signup Form — Extended Applicant Fields Implementation Plan

> **STATUS: ✅ Implemented (verified 2026-08-05).** The extended fields
> (`companyName`, `roleInCompany`, `companyWebsite`, `phoneNumber`, country,
> `signupStatus`, …) are live in `frontend/prisma/schema.prisma` and
> `frontend/src/components/auth/SignupForm.tsx`, and the missing Alembic
> migration was added in commit `27bc89c`. The unchecked `- [ ]` boxes below
> were never ticked during implementation — they are historical planning
> steps, not outstanding work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username, role-in-company, company website, and a validated international phone number to the public `/signup` form, and surface them in the Super Admin's Access Requests review panel — so a Super Admin has enough information to vet a signup request before granting `ADMIN` access.

**Architecture:** Purely additive to the existing signup/approval flow (`docs/superpowers/plans/2026-07-29-admin-signup-approval-plan.md`): four new nullable columns on `User`, extended validation on the existing `POST /api/signup` route and `SignupForm.tsx`, extended display on the existing `SignupRequestRow.tsx`. No changes to `authorize()`, `/login`, or the approval endpoint's authorization logic.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / PostgreSQL, `zod`, `libphonenumber-js` (new dependency, for international phone validation), Playwright (`tests/e2e`) — this repo has no unit-test runner, only Playwright e2e and standalone `tsx` selfcheck scripts for pure logic (see `frontend/src/lib/auth/signupRateLimit.selfcheck.ts` for the existing pattern).

## Global Constraints

- All four new fields (`username`, `roleInCompany`, `companyWebsite`, `phoneNumber`) are **required** at signup, validated both client- and server-side — never trust client-side validation alone.
- New columns are **nullable in the DB** (`String?`), matching the existing `companyName` pattern — existing accounts backfill to `NULL`, no data migration needed.
- `username` is **unique**; a duplicate returns `409 { code: "USERNAME_TAKEN" }`, distinct from the existing `409 { code: "EMAIL_TAKEN" }`.
- **Login stays email + password only** — do not touch `frontend/src/lib/auth.ts`'s `authorize()`, the `/login` page, or NextAuth config.
- Phone numbers are stored as **E.164 strings** (e.g. `+12133734253`), produced client-side from a country-code `<select>` + national-number `<input>` via `libphonenumber-js`, and **re-validated server-side** — the server never trusts the client's computed string.
- **No new UI library** for the country selector — a native `<select>` styled to match the existing `Input` component's Tailwind classes.
- Approval logic is unchanged: approving a request still only ever sets `role: ADMIN`, never `SUPER_ADMIN` — this plan touches no authorization code.
- **e2e tests that call `POST /api/signup` must send a distinct synthetic `x-forwarded-for` header per test scenario.** The in-memory signup rate limiter (5 requests/hour, see `frontend/src/lib/auth/signupRateLimit.ts`) is keyed by IP and shared across the *entire* e2e run against one dev-server process — this plan adds enough new endpoint-hitting test cases that reusing the default "unknown" bucket would trip `429`s partway through a full-suite run. This is the same class of bug already fixed once in commit `d66702a` for other spec files; this plan fixes it at the source (distinct IP per scenario) rather than reintroducing it.

---

### Task 1: Phone validation helper

**Files:**
- Modify: `frontend/package.json` (add `libphonenumber-js` dependency)
- Create: `frontend/src/lib/phone.ts`
- Create: `frontend/src/lib/phone.selfcheck.ts`

**Interfaces:**
- Produces: `toE164(country: CountryCode, nationalNumber: string): string | null`, `isValidE164(phoneNumber: string): boolean`, `countryOptions(): CountryOption[]` where `CountryOption = { code: CountryCode; callingCode: string }`. Task 3 (server) imports `isValidE164`; Task 4 (client form) imports `toE164` and `countryOptions`.

- [ ] **Step 1: Install the dependency**

Run: `cd frontend && npm install libphonenumber-js`
Expected: `package.json` and `package-lock.json` gain the new dependency.

- [ ] **Step 2: Write the selfcheck (this repo has no unit-test runner — see Tech Stack)**

```typescript
// frontend/src/lib/phone.selfcheck.ts
import assert from "node:assert";
import { toE164, isValidE164, countryOptions } from "./phone";

const valid = toE164("US", "2133734253");
assert.strictEqual(valid, "+12133734253", "a valid US number must format to the expected E.164 string");

const invalid = toE164("US", "123");
assert.strictEqual(invalid, null, "a too-short number must be rejected");

assert.strictEqual(isValidE164("+12133734253"), true, "a valid E.164 string must pass re-validation");
assert.strictEqual(isValidE164("not-a-phone-number"), false, "garbage must fail re-validation");

const options = countryOptions();
assert.ok(
  options.some((o) => o.code === "US" && o.callingCode === "+1"),
  "country list must include US with +1"
);
assert.ok(options.length > 100, "country list must include the full set of ISO countries");

console.log("phone.selfcheck: all assertions passed");
```

- [ ] **Step 3: Run it to verify it fails (module doesn't exist yet)**

Run: `cd frontend && npx tsx src/lib/phone.selfcheck.ts`
Expected: FAIL — cannot find module `./phone`.

- [ ] **Step 4: Write the helper**

```typescript
// frontend/src/lib/phone.ts
import {
  isValidPhoneNumber,
  parsePhoneNumber,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

export interface CountryOption {
  code: CountryCode;
  callingCode: string;
}

/** Combines a country + national number into an E.164 string, or null if invalid for that country. */
export function toE164(country: CountryCode, nationalNumber: string): string | null {
  if (!isValidPhoneNumber(nationalNumber, country)) return null;
  return parsePhoneNumber(nationalNumber, country).number;
}

/** Re-validates an already-combined E.164 string — the server-side source of truth. */
export function isValidE164(phoneNumber: string): boolean {
  return isValidPhoneNumber(phoneNumber);
}

export function countryOptions(): CountryOption[] {
  return getCountries().map((code) => ({
    code,
    callingCode: `+${getCountryCallingCode(code)}`,
  }));
}
```

- [ ] **Step 5: Run the selfcheck to verify it passes**

Run: `cd frontend && npx tsx src/lib/phone.selfcheck.ts`
Expected: prints `phone.selfcheck: all assertions passed`.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/phone.ts frontend/src/lib/phone.selfcheck.ts
git commit -m "feat(signup): add phone validation helper using libphonenumber-js"
```

---

### Task 2: Prisma schema — extended signup fields

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Migration: generated by `prisma migrate dev`

**Interfaces:**
- Produces: `User.username: String? @unique`, `User.roleInCompany: String?`, `User.companyWebsite: String?`, `User.phoneNumber: String?`. Task 3 and Task 5 read/write these via `prisma.user`.

- [ ] **Step 1: Add the new fields to `frontend/prisma/schema.prisma`**

In the existing `model User { ... }` block, add these four fields alongside the existing `companyName`/`signupStatus`:

```prisma
  companyName    String?      @map("company_name")
  signupStatus   SignupStatus @default(APPROVED) @map("signup_status")
  username       String?      @unique @map("username")
  roleInCompany  String?      @map("role_in_company")
  companyWebsite String?      @map("company_website")
  phoneNumber    String?      @map("phone_number")
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd frontend && npm run db:migrate -- --name signup_extended_fields`
Expected: Prisma creates a new migration under `frontend/prisma/migrations/` and applies it. All four new columns are nullable, so every existing `User` row backfills to `NULL` with no prompt or data migration needed — matches the existing `companyName` column's behavior.

- [ ] **Step 3: Verify the schema is valid and the client typechecks**

Run: `cd frontend && npx prisma validate && npm run type-check`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(signup): add username, roleInCompany, companyWebsite, phoneNumber to User"
```

---

### Task 3: Extend the signup API route

**Files:**
- Modify: `frontend/src/app/api/signup/route.ts`
- Modify: `frontend/tests/e2e/signup-api.spec.ts`

**Interfaces:**
- Consumes: `isValidE164` (Task 1); `User.username`/`roleInCompany`/`companyWebsite`/`phoneNumber` (Task 2).
- Produces: `POST /api/signup` now accepts `{ companyName, name, username, roleInCompany, companyWebsite, phoneNumber, email, password }`. New response: `409 { error: { code: "USERNAME_TAKEN" } }` on duplicate username. Task 4's `SignupForm` is the only intended caller.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/tests/e2e/signup-api.spec.ts` entirely:

```typescript
// frontend/tests/e2e/signup-api.spec.ts
import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";

// A distinct synthetic IP per request keeps this file's calls to the real
// signup rate limiter (5/hour, shared across the whole e2e run — see the
// plan's Global Constraints) from colliding with each other or with
// signup-page.spec.ts's own call.
function uniqueTestIp(): string {
  const a = Math.floor(Math.random() * 254) + 1;
  const b = Math.floor(Math.random() * 254) + 1;
  return `192.0.${a}.${b}`;
}

function validPayload(overrides: Partial<Record<string, string>> = {}) {
  return {
    companyName: "Acme Testing Co",
    name: "Jane Applicant",
    username: `jane-applicant-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    roleInCompany: "Head of Talent",
    companyWebsite: "https://acme-testing.example.com",
    phoneNumber: "+12133734253",
    email: `e2e-signup-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
    password: "correct-horse-battery",
    ...overrides,
  };
}

test.describe("POST /api/signup", () => {
  test("creates a pending admin account for a valid request", async ({ request }) => {
    const payload = validPayload();

    const res = await request.post("/api/signup", {
      data: payload,
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(res.status()).toBe(201);

    const created = await prisma.user.findUnique({ where: { email: payload.email } });
    expect(created).not.toBeNull();
    expect(created?.role).toBe("ADMIN");
    expect(created?.signupStatus).toBe("PENDING");
    expect(created?.companyName).toBe("Acme Testing Co");
    expect(created?.username).toBe(payload.username);
    expect(created?.roleInCompany).toBe("Head of Talent");
    expect(created?.companyWebsite).toBe("https://acme-testing.example.com");
    expect(created?.phoneNumber).toBe("+12133734253");

    await prisma.user.delete({ where: { email: payload.email } });
  });

  test("rejects a duplicate email with 409", async ({ request }) => {
    const payload = validPayload();
    const ip = uniqueTestIp();

    const first = await request.post("/api/signup", { data: payload, headers: { "x-forwarded-for": ip } });
    expect(first.status()).toBe(201);

    const second = await request.post("/api/signup", {
      data: validPayload({ email: payload.email }),
      headers: { "x-forwarded-for": ip },
    });
    expect(second.status()).toBe(409);
    expect((await second.json()).error.code).toBe("EMAIL_TAKEN");

    await prisma.user.delete({ where: { email: payload.email } });
  });

  test("rejects a duplicate username with 409", async ({ request }) => {
    const username = `dup-username-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ip = uniqueTestIp();

    const first = await request.post("/api/signup", {
      data: validPayload({ username }),
      headers: { "x-forwarded-for": ip },
    });
    expect(first.status()).toBe(201);

    const second = await request.post("/api/signup", {
      data: validPayload({ username }),
      headers: { "x-forwarded-for": ip },
    });
    expect(second.status()).toBe(409);
    expect((await second.json()).error.code).toBe("USERNAME_TAKEN");

    await prisma.user.deleteMany({ where: { username } });
  });

  test("rejects an invalid phone number with 400", async ({ request }) => {
    const res = await request.post("/api/signup", {
      data: validPayload({ phoneNumber: "not-a-phone-number" }),
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects an invalid company website with 400", async ({ request }) => {
    const res = await request.post("/api/signup", {
      data: validPayload({ companyWebsite: "not-a-url" }),
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects an invalid body with 400", async ({ request }) => {
    const res = await request.post("/api/signup", {
      data: { companyName: "", name: "", email: "not-an-email", password: "short" },
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(res.status()).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx playwright test signup-api.spec.ts`
Expected: FAIL — the current route ignores `username`/`roleInCompany`/`companyWebsite`/`phoneNumber` (zod strips unknown keys), so the first test's field assertions fail; the duplicate-username and invalid-phone/website tests fail since nothing validates those yet.

- [ ] **Step 3: Extend the route**

Replace `frontend/src/app/api/signup/route.ts` entirely:

```typescript
// frontend/src/app/api/signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, Role, SignupStatus } from "@prisma/client";
import { isSignupRateLimited, recordSignupAttempt } from "@/lib/auth/signupRateLimit";
import { getForwardedClientIp } from "@/lib/server/clientIp";
import { isValidE164 } from "@/lib/phone";

const signupSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(255).trim(),
  name: z.string().min(1, "Name is required").max(255).trim(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens")
    .trim(),
  roleInCompany: z.string().min(1, "Role in company is required").max(255).trim(),
  companyWebsite: z.string().url("Enter a valid company website URL"),
  phoneNumber: z.string().refine(isValidE164, "Enter a valid phone number"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  const ip = getForwardedClientIp(req) ?? "unknown";
  if (isSignupRateLimited(ip)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many signup attempts. Please try again later." } },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid input.",
        },
      },
      { status: 400 }
    );
  }

  recordSignupAttempt(ip);

  const { companyName, name, username, roleInCompany, companyWebsite, phoneNumber, email, password } = parsed.data;

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json(
      { error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." } },
      { status: 409 }
    );
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return NextResponse.json(
      { error: { code: "USERNAME_TAKEN", message: "This username is already taken." } },
      { status: 409 }
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        companyName,
        username,
        roleInCompany,
        companyWebsite,
        phoneNumber,
        role: Role.ADMIN,
        signupStatus: SignupStatus.PENDING,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
      if (fields.includes("username")) {
        return NextResponse.json(
          { error: { code: "USERNAME_TAKEN", message: "This username is already taken." } },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." } },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx playwright test signup-api.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/signup/route.ts frontend/tests/e2e/signup-api.spec.ts
git commit -m "feat(signup): validate and persist username, role, website, phone on signup"
```

---

### Task 4: Extend the signup form

**Files:**
- Modify: `frontend/src/components/auth/SignupForm.tsx`
- Modify: `frontend/tests/e2e/signup-page.spec.ts`

**Interfaces:**
- Consumes: `toE164`, `countryOptions` (Task 1); extended `POST /api/signup` body (Task 3).
- Produces: the `/signup` form now collects and submits all eight fields.

- [ ] **Step 1: Write the failing test**

Replace `frontend/tests/e2e/signup-page.spec.ts` entirely:

```typescript
// frontend/tests/e2e/signup-page.spec.ts
import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";

function uniqueTestIp(): string {
  const a = Math.floor(Math.random() * 254) + 1;
  const b = Math.floor(Math.random() * 254) + 1;
  return `192.0.${a}.${b}`;
}

test.describe("signup page", () => {
  test("visitor can submit the signup form and sees a pending-approval message", async ({ page }) => {
    const email = `e2e-signup-page-${Date.now()}@example.com`;

    // Distinct synthetic IP — see Task 3/Global Constraints on the shared
    // in-memory rate-limit bucket across the e2e run.
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": uniqueTestIp() });

    await page.goto("/login");
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByLabel("Company name").fill("Acme Testing Co");
    await page.getByLabel("Full name").fill("Jane Applicant");
    await page.getByLabel("Username").fill(`jane-applicant-${Date.now()}`);
    await page.getByLabel("Role in company").fill("Head of Talent");
    await page.getByLabel("Company website").fill("https://acme-testing.example.com");
    await page.getByLabel("Country code").selectOption("US");
    await page.getByLabel("Phone number").fill("2133734253");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery");
    await page.getByRole("button", { name: /request access|sign up/i }).click();

    // Scoped to the form's role="status" success container — the page's own
    // header copy ("a Super Admin reviews every request") also matches this
    // regex, so an unscoped getByText resolves against static text before the
    // real submission finishes and races ahead of the DB write.
    await expect(page.getByRole("status")).toContainText(/pending|awaiting approval|review/i);

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created?.signupStatus).toBe("PENDING");
    expect(created?.phoneNumber).toBe("+12133734253");
    expect(created?.roleInCompany).toBe("Head of Talent");
    await prisma.user.delete({ where: { email } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx playwright test signup-page.spec.ts`
Expected: FAIL — `getByLabel("Username")` etc. don't exist on the form yet.

- [ ] **Step 3: Extend the form**

Replace `frontend/src/components/auth/SignupForm.tsx` entirely:

```typescript
// frontend/src/components/auth/SignupForm.tsx
"use client";

import { useState } from "react";
import { z } from "zod";
import type { CountryCode } from "libphonenumber-js";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { countryOptions, toE164 } from "@/lib/phone";

const signupFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(255),
  name: z.string().min(1, "Name is required").max(255),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Only letters, numbers, dots, underscores, and hyphens"),
  roleInCompany: z.string().min(1, "Role in company is required").max(255),
  companyWebsite: z.string().url("Enter a valid company website URL"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof signupFormSchema> | "phone", string>>;

const COUNTRY_OPTIONS = countryOptions();

export function SignupForm() {
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [roleInCompany, setRoleInCompany] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [country, setCountry] = useState<CountryCode>("US");
  const [phoneNational, setPhoneNational] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = signupFormSchema.safeParse({
      companyName,
      name,
      username,
      roleInCompany,
      companyWebsite,
      email,
      password,
    });
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as keyof FormErrors] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    const phoneNumber = toE164(country, phoneNational);
    if (!phoneNumber) {
      setErrors({ phone: "Enter a valid phone number for the selected country" });
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...parsed.data, phoneNumber }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setSubmitError(body?.error?.message ?? "Unable to submit your request.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div role="status" className="text-center">
        <p className="text-sm font-medium text-slate-900">Request submitted</p>
        <p className="mt-2 text-sm text-slate-600">
          Thanks — your access request is pending review. A Super Admin will approve it before you
          can sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Input
        label="Company name"
        placeholder="Acme Corp"
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        error={errors.companyName}
        autoComplete="organization"
        autoFocus
        disabled={loading}
      />
      <Input
        label="Full name"
        placeholder="Jane Smith"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        autoComplete="name"
        disabled={loading}
      />
      <Input
        label="Username"
        placeholder="jane-smith"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={errors.username}
        autoComplete="username"
        disabled={loading}
      />
      <Input
        label="Role in company"
        placeholder="Head of Talent"
        value={roleInCompany}
        onChange={(e) => setRoleInCompany(e.target.value)}
        error={errors.roleInCompany}
        autoComplete="organization-title"
        disabled={loading}
      />
      <Input
        label="Company website"
        type="url"
        placeholder="https://acme.com"
        value={companyWebsite}
        onChange={(e) => setCompanyWebsite(e.target.value)}
        error={errors.companyWebsite}
        autoComplete="url"
        disabled={loading}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="signup-phone">
          Phone number
        </label>
        <div className="flex gap-2">
          <select
            aria-label="Country code"
            value={country}
            onChange={(e) => setCountry(e.target.value as CountryCode)}
            disabled={loading}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} ({option.callingCode})
              </option>
            ))}
          </select>
          <input
            id="signup-phone"
            type="tel"
            placeholder="2015550123"
            value={phoneNational}
            onChange={(e) => setPhoneNational(e.target.value)}
            autoComplete="tel-national"
            disabled={loading}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>
        {errors.phone && (
          <p role="alert" className="text-xs text-danger">
            {errors.phone}
          </p>
        )}
      </div>

      <Input
        label="Email address"
        type="email"
        placeholder="jane@acme.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        autoComplete="email"
        disabled={loading}
      />
      <Input
        label="Password"
        type="password"
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        autoComplete="new-password"
        disabled={loading}
      />

      {submitError && (
        <div role="alert" className="rounded-lg border border-danger/20 bg-danger-light px-3 py-2">
          <p className="text-xs text-danger-dark">{submitError}</p>
        </div>
      )}

      <Button type="submit" loading={loading} className="mt-1 w-full" size="lg">
        Request access
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx playwright test signup-page.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/SignupForm.tsx frontend/tests/e2e/signup-page.spec.ts
git commit -m "feat(signup): collect username, role, website, and phone on the signup form"
```

---

### Task 5: Display the new fields in the Access Requests panel

**Files:**
- Modify: `frontend/src/components/admin/SignupRequestRow.tsx`
- Modify: `frontend/src/app/(admin)/dashboard/users/page.tsx`

**Interfaces:**
- Consumes: `User.username`/`roleInCompany`/`companyWebsite`/`phoneNumber` (Task 2).
- Produces: the existing Access Requests row shows the four new fields. No new endpoint — Approve/Reject still only calls the existing `PATCH /api/admin/users/[id]/signup-status`.

- [ ] **Step 1: Extend the row component**

In `frontend/src/components/admin/SignupRequestRow.tsx`, extend the props interface:

```typescript
interface SignupRequestRowProps {
  userId: string;
  companyName: string | null;
  name: string;
  email: string;
  username: string | null;
  roleInCompany: string | null;
  companyWebsite: string | null;
  phoneNumber: string | null;
  signupStatus: "PENDING" | "REJECTED";
  requestedAt: string;
}
```

Add the new props to the destructured function signature (alongside the existing `companyName`, `name`, `email`, `signupStatus`, `requestedAt`):

```typescript
export function SignupRequestRow({
  userId,
  companyName,
  name,
  email,
  username,
  roleInCompany,
  companyWebsite,
  phoneNumber,
  signupStatus,
  requestedAt,
}: SignupRequestRowProps) {
```

Replace the existing contact-info paragraph and add the new detail lines right after it (inside the `<div className="min-w-0 flex-1">` block, before the `{error && ...}` line):

```typescript
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {name} — {email}
          {username && ` · @${username}`}
        </p>
        {[roleInCompany, phoneNumber].filter(Boolean).length > 0 && (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[roleInCompany, phoneNumber].filter(Boolean).join(" · ")}
          </p>
        )}
        {companyWebsite && (
          <a
            href={companyWebsite}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-0.5 block truncate text-xs text-brand-700 hover:underline"
          >
            {companyWebsite}
          </a>
        )}
        <p className="mt-0.5 text-xs text-slate-400">Requested {requestedAt}</p>
```

- [ ] **Step 2: Pass the new fields from the Users page**

In `frontend/src/app/(admin)/dashboard/users/page.tsx`, extend the `<SignupRequestRow>` call:

```typescript
            <SignupRequestRow
              key={req.id}
              userId={req.id}
              companyName={req.companyName}
              name={req.name}
              email={req.email}
              username={req.username}
              roleInCompany={req.roleInCompany}
              companyWebsite={req.companyWebsite}
              phoneNumber={req.phoneNumber}
              signupStatus={req.signupStatus as "PENDING" | "REJECTED"}
              requestedAt={formatDate(req.createdAt)}
            />
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run type-check`
Expected: exits 0.

- [ ] **Step 4: Manually verify**

No `SUPER_ADMIN` e2e fixture exists (same constraint as the base signup plan). Verify by hand:
1. `cd frontend && npm run dev`
2. Sign up a test account at `/signup`, filling all eight fields.
3. Log in as a seeded `SUPER_ADMIN`, visit `/dashboard/users`.
4. Confirm the Access Requests row shows the username, role in company, phone number, and a clickable company website link, alongside the existing company name/name/email.
5. Confirm Approve/Reject still work exactly as before.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/SignupRequestRow.tsx "frontend/src/app/(admin)/dashboard/users/page.tsx"
git commit -m "feat(signup): show username, role, website, and phone in Access Requests"
```

---

## Post-plan checklist (not a task — verify once all tasks land)

- [ ] Full e2e suite passes: `cd frontend && npm run test:e2e`
- [ ] `cd frontend && npm run type-check` and `npm run lint` both pass
- [ ] Manually walk the full loop once: sign up at `/signup` with all eight fields → confirm login is blocked → approve as Super Admin, confirming the new fields are visible in the review panel → confirm login now works.
