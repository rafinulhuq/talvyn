import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

test.describe("Users page guard", () => {
  test("a logged-in Admin (not Super Admin) sees the access-required message, not the Access Requests list", async ({
    page,
  }) => {
    const email = `e2e-users-guard-${Date.now()}@example.com`;
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

    await page.goto("/dashboard/users");
    await expect(page.getByText("Super Admin access required")).toBeVisible();
    await expect(page.getByText("Access Requests")).toHaveCount(0);

    await prisma.user.delete({ where: { email } });
  });
});
