import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

test.describe("login gate for unapproved signups", () => {
  test("a pending signup cannot log in; approving it unblocks login", async ({ page }) => {
    const email = `e2e-login-gate-${Date.now()}@example.com`;
    const password = "correct-horse-battery";

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name: "Jane Applicant",
        email,
        passwordHash,
        companyName: "Acme Testing Co",
        role: "ADMIN",
        signupStatus: "PENDING",
      },
    });

    // Still PENDING — login must fail with the same generic message as a wrong password.
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // Simulate approval directly (the real approval UI is Super-Admin-only —
    // see Task 6/7 — and there's no Super Admin fixture available in e2e).
    await prisma.user.update({ where: { email }, data: { signupStatus: "APPROVED" } });

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await prisma.user.delete({ where: { email } });
  });
});
