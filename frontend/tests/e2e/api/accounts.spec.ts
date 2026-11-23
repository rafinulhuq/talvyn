import { expect, test } from "@playwright/test";
import { cleanup, createUser, json, prisma, signIn, testIp } from "./helpers";

const rand = () => Math.random().toString(36).slice(2, 10);
const signupPayload = (o: Record<string, string> = {}) => ({
  companyName: "Northwind Talent",
  name: "Jane Applicant",
  username: `jane-${rand()}`,
  roleInCompany: "Head of Talent",
  companyWebsite: "https://northwind.example.com",
  phoneNumber: "+12133734253",
  email: `e2e-signup-${rand()}@example.com`,
  password: "correct-horse-battery",
  ...o,
});

test.describe("POST /api/signup", () => {
  test("creates a PENDING USER with normalized fields", async ({ request }) => {
    const p = signupPayload({ email: `E2E-Signup-${rand()}@Example.com` });
    const res = await request.post("/api/signup", { data: p, headers: { "x-forwarded-for": testIp() } });
    expect(res.status()).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: p.email.toLowerCase() } });
    expect(u.role).toBe("USER");
    expect(u.signupStatus).toBe("PENDING");
    expect(u.phoneNumber).toBe("+12133734253");
    await cleanup(u.id);
  });

  test("duplicate email and username → 409 with distinct codes", async ({ request }) => {
    const ip = testIp();
    const p = signupPayload();
    expect((await request.post("/api/signup", { data: p, headers: { "x-forwarded-for": ip } })).status()).toBe(201);
    const dupEmail = await request.post("/api/signup", { data: signupPayload({ email: p.email }), headers: { "x-forwarded-for": ip } });
    expect(dupEmail.status()).toBe(409);
    expect((await dupEmail.json()).error.code).toBe("EMAIL_TAKEN");
    const dupUser = await request.post("/api/signup", { data: signupPayload({ username: p.username }), headers: { "x-forwarded-for": ip } });
    expect(dupUser.status()).toBe(409);
    expect((await dupUser.json()).error.code).toBe("USERNAME_TAKEN");
    await prisma.user.deleteMany({ where: { email: p.email } });
  });

  for (const [field, value] of [
    ["phoneNumber", "not-a-phone"],
    ["companyWebsite", "javascript:alert(1)"],
    ["companyWebsite", "not-a-url"],
    ["password", "short"],
    ["password", "a".repeat(73)],
  ] as [string, string][]) {
    test(`rejects ${field}=${value.slice(0, 20)} with 400`, async ({ request }) => {
      const res = await request.post("/api/signup", { data: signupPayload({ [field]: value }), headers: { "x-forwarded-for": testIp() } });
      expect(res.status()).toBe(400);
    });
  }
});

test.describe("admin user management", () => {
  // Serial: the last-Super-Admin test temporarily deactivates other Super Admins.
  test.describe.configure({ mode: "serial" });

  test("401 unauthenticated, 403 for ADMIN, 403 cross-site", async ({ request }) => {
    expect((await request.patch("/api/admin/users/x/signup-status", { data: { signupStatus: "APPROVED" }, headers: json })).status()).toBe(401);
    const admin = await createUser({ role: "ADMIN" });
    expect(await signIn(request, admin.email)).toBe(true);
    expect((await request.patch(`/api/admin/users/${admin.id}/signup-status`, { data: { signupStatus: "APPROVED" }, headers: json })).status()).toBe(403);
    const cross = await request.patch(`/api/admin/users/${admin.id}/role`, {
      data: { role: "USER" },
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
    });
    expect(cross.status()).toBe(403);
    expect((await cross.json()).error.code).toBe("CROSS_SITE_REQUEST");
    await cleanup(admin.id);
  });

  test("Super Admin approves a request, creates an account, and cannot change their own status", async ({ request }) => {
    const sa = await createUser({ role: "SUPER_ADMIN" });
    const pending = await createUser({ role: "USER", signupStatus: "PENDING" });
    expect(await signIn(request, sa.email)).toBe(true);

    const approve = await request.patch(`/api/admin/users/${pending.id}/signup-status`, { data: { signupStatus: "APPROVED" }, headers: json });
    expect(approve.status()).toBe(200);
    expect((await approve.json()).user.signupStatus).toBe("APPROVED");

    const created = await request.post("/api/admin/users", {
      data: { name: "New Admin", email: `E2E-${rand()}@Example.com`, password: "correct-horse-battery", role: "ADMIN" },
      headers: json,
    });
    expect(created.status()).toBe(201);
    const newId = (await created.json()).user.id as string;

    expect((await request.patch(`/api/admin/users/${sa.id}/status`, { data: { isActive: false }, headers: json })).status()).toBe(400);
    await cleanup(sa.id, pending.id, newId);
  });

  test("the last ACTIVE Super Admin can't be demoted, even if inactive Super Admins exist", async ({ request }) => {
    // Isolate: deactivate any other active Super Admins in this throwaway DB for the duration.
    const others = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true, deletedAt: null }, select: { id: true } });
    await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: false } });

    const actor = await createUser({ role: "SUPER_ADMIN" });
    const inactiveSa = await createUser({ role: "SUPER_ADMIN", isActive: false });
    expect(await signIn(request, actor.email)).toBe(true);
    // Make the actor the only active SA, then try to demote them via another actor? Self-demotion is the realistic path.
    const res = await request.patch(`/api/admin/users/${actor.id}/role`, { data: { role: "ADMIN" }, headers: json });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("LAST_SUPER_ADMIN");

    await cleanup(actor.id, inactiveSa.id);
    await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: true } });
  });
});

test.describe("password reset", () => {
  test("forgot returns the same response for unknown and known emails", async ({ request }) => {
    const u = await createUser();
    const a = await request.post("/api/password/forgot", { data: { email: u.email }, headers: { "x-forwarded-for": testIp() } });
    const b = await request.post("/api/password/forgot", { data: { email: `nobody-${rand()}@example.com` }, headers: { "x-forwarded-for": testIp() } });
    expect(a.status()).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    await cleanup(u.id);
  });

  test("reset rejects malformed and unknown tokens", async ({ request }) => {
    const base = { password: "new-password-123", confirmPassword: "new-password-123" };
    expect((await request.post("/api/password/reset", { data: { ...base, token: "nope" }, headers: { "x-forwarded-for": testIp() } })).status()).toBe(400);
    const unknown = await request.post("/api/password/reset", { data: { ...base, token: "a".repeat(64) }, headers: { "x-forwarded-for": testIp() } });
    expect(unknown.status()).toBe(400);
    expect((await unknown.json()).error.code).toBe("INVALID_TOKEN");
  });
});

test.describe("analytics ingestion", () => {
  test("track always 204s and scrubs PII from what it stores", async ({ request }) => {
    const sessionId = `e2e-${rand()}`;
    const res = await request.post("/api/track", {
      data: {
        sessionId,
        type: "PAGE_VIEW",
        path: "/tests/abcdef?token=secret123",
        targetLabel: "Contact jane@example.com",
        metadataJson: { email: "x@y.com", plan: "pro" },
      },
    });
    expect(res.status()).toBe(204);
    const ev = await prisma.trackedEvent.findFirstOrThrow({ where: { sessionId } });
    expect(ev.path).toBe("/tests/abcdef");
    expect(ev.targetLabel).toBe("Contact [email]");
    expect(ev.metadataJson).toEqual({ plan: "pro" });
    await prisma.trackedEvent.deleteMany({ where: { sessionId } });
    await prisma.visitorSession.deleteMany({ where: { id: sessionId } });
    expect((await request.post("/api/track", { data: { junk: true } })).status()).toBe(204);
  });
});
