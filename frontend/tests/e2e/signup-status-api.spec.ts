import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

test.describe("PATCH /api/admin/users/[id]/signup-status", () => {
  test("rejects an unauthenticated request", async ({ request }) => {
    const res = await request.patch("/api/admin/users/does-not-matter/signup-status", {
      data: { signupStatus: "APPROVED" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects a request from a logged-in Admin (not Super Admin)", async ({ page }) => {
    const email = `e2e-signup-status-${Date.now()}@example.com`;
    const password = "correct-horse-battery";

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name: "Jane Applicant",
        email,
        passwordHash,
        companyName: "Acme Testing Co",
        role: "ADMIN",
        signupStatus: "APPROVED",
      },
    });

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const target = await prisma.user.findUniqueOrThrow({ where: { email } });
    const res = await page.request.patch(`/api/admin/users/${target.id}/signup-status`, {
      data: { signupStatus: "APPROVED" },
    });
    expect(res.status()).toBe(403);

    await prisma.user.delete({ where: { email } });
  });
});
