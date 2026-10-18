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
