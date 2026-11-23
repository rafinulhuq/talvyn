import { expect, test } from "@playwright/test";
import { cleanup, createUser, prisma, signIn } from "./helpers";

test.describe("sign-in rules", () => {
  test("approved active user signs in; email is case-insensitive", async ({ request }) => {
    const u = await createUser();
    expect(await signIn(request, u.email.toUpperCase())).toBe(true);
    await cleanup(u.id);
  });

  for (const [label, opts] of [
    ["pending signup", { signupStatus: "PENDING" as const }],
    ["rejected signup", { signupStatus: "REJECTED" as const }],
    ["deactivated", { isActive: false }],
    ["removed", { deleted: true }],
  ] as const) {
    test(`${label} account cannot sign in`, async ({ request }) => {
      const u = await createUser(opts);
      expect(await signIn(request, u.email)).toBe(false);
      await cleanup(u.id);
    });
  }

  test("lockout after 5 failures can't be reset by changing email case", async ({ request }) => {
    const u = await createUser();
    const variants = [u.email, u.email.toUpperCase(), u.email.replace("e2e", "E2E"), u.email.replace("example", "EXAMPLE"), u.email];
    for (const e of variants) expect(await signIn(request, e, "wrong-password-1")).toBe(false);
    expect(await signIn(request, u.email)).toBe(false); // locked, even with the right password
    await cleanup(u.id);
  });

  test("password change (sessionVersion bump) revokes an existing session", async ({ request }) => {
    const u = await createUser();
    expect(await signIn(request, u.email)).toBe(true);
    await prisma.user.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 } } });
    const res = await request.get("/api/proxy/api/v1/health");
    expect(res.status()).toBe(401);
    await cleanup(u.id);
  });
});

test.describe("/api/proxy", () => {
  test("401 without a session", async ({ request }) => {
    expect((await request.get("/api/proxy/api/v1/health")).status()).toBe(401);
  });

  test("never forwards internal-only or path-escaping requests", async ({ request }) => {
    const u = await createUser();
    expect(await signIn(request, u.email)).toBe(true);
    const attempts = [
      "/api/proxy/api/v1/internal/emails/signup-request",
      "/api/proxy/x/%2e%2e/api/v1/internal/emails/signup-request",
      "/api/proxy/x/%2E%2E/api/v1/internal/emails/signup-request",
      "/api/proxy/api/v1%2Finternal%2Femails%2Fsignup-request",
      "/api/proxy/api/v1/jd/%2e%2e%2f%2e%2e%2finternal/emails/signup-request",
    ];
    for (const path of attempts) {
      const res = await request.post(path, { data: {}, headers: { "content-type": "application/json" }, maxRedirects: 0 });
      // 404 from our guard (or Next's own normalization) — never forwarded (forwarding would be 502: no backend).
      expect([404, 400], `${path} → ${res.status()}`).toContain(res.status());
    }
    await cleanup(u.id);
  });

  test("unreachable backend surfaces a clean 502, not a crash", async ({ request }) => {
    const u = await createUser();
    expect(await signIn(request, u.email)).toBe(true);
    const res = await request.get("/api/proxy/api/v1/health");
    expect(res.status()).toBe(502);
    expect((await res.json()).error.code).toBe("UPSTREAM_UNAVAILABLE");
    await cleanup(u.id);
  });
});

test.describe("candidate and public proxies", () => {
  test("only allowlisted endpoints and methods are forwarded", async ({ request }) => {
    expect((await request.get("/api/candidate/api/v1/admin/backup")).status()).toBe(404);
    expect((await request.get("/api/candidate/api/v1/attempts/start")).status()).toBe(404); // wrong method
    expect((await request.get("/api/public/api/v1/jd")).status()).toBe(404);
    // Allowed shape → forwarded → backend unreachable → 502
    expect((await request.get("/api/candidate/api/v1/attempts/abc/state")).status()).toBe(502);
  });
});

test.describe("request gate (proxy.ts)", () => {
  test("dashboard redirects to login with a callback", async ({ request }) => {
    const res = await request.get("/dashboard/settings?tab=team", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/login?callbackUrl=%2Fdashboard%2Fsettings%3Ftab%3Dteam");
  });

  test("magic link token moves into an httpOnly cookie and out of the URL", async ({ request }) => {
    const res = await request.get("/tests/tok_abc123/exam", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toMatch(/\/tests\/session\/exam$/);
    const cookie = res.headers()["set-cookie"] ?? "";
    expect(cookie).toContain("ov_attempt_token=tok_abc123");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  test("tokenless candidate routes are not treated as tokens", async ({ request }) => {
    const res = await request.get("/tests/session", { maxRedirects: 0 });
    expect(res.headers()["set-cookie"] ?? "").not.toContain("ov_attempt_token");
  });

  test("USER is bounced from Super Admin areas", async ({ request }) => {
    const u = await createUser({ role: "USER" });
    expect(await signIn(request, u.email)).toBe(true);
    const res = await request.get("/dashboard/users", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(new URL(res.headers().location ?? "", "http://x").pathname).toBe("/dashboard");
    await cleanup(u.id);
  });
});
