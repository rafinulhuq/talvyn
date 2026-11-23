import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { cleanup, createUser, PASSWORD } from "../api/helpers";

test.describe("sign in", () => {
  test("wrong password shows one generic error; right password lands on the callback page", async ({ page }) => {
    const u = await createUser({ role: "SUPER_ADMIN" });
    await page.goto("/dashboard/users");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard%2Fusers$/);

    await page.getByLabel("Work email").fill(u.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't sign you in" })).toContainText("don't match an active account");

    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard\/users$/);
    await cleanup(u.id);
  });

  test("off-site callback URLs are ignored", async ({ page }) => {
    const u = await createUser();
    await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.example%2Fsteal");
    await page.getByLabel("Work email").fill(u.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await cleanup(u.id);
  });

  test("signed-in users are sent from /login to the dashboard, and the shell shows their nav", async ({ page }) => {
    const u = await createUser({ role: "USER" });
    await page.goto("/login");
    await page.getByLabel("Work email").fill(u.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Candidates" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0); // Super Admin only
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
    await cleanup(u.id);
  });
});

test.describe("account pages", () => {
  test("signup validates every field before sending", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Enter a phone number.")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
  });

  test("reset page explains an invalid link instead of showing a form", async ({ page }) => {
    await page.goto("/reset-password?token=nope");
    await expect(page.getByText("This reset link isn't valid")).toBeVisible();
    await expect(page.getByLabel("New password")).toHaveCount(0);
  });

  for (const path of ["/login", "/signup", "/forgot-password"]) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});
