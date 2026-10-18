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
    username: `jane-applicant-${Math.random().toString(36).slice(2, 10)}`,
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
    const username = `dup-username-${Math.random().toString(36).slice(2, 10)}`;
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
