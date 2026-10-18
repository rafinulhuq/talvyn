import { expect, test } from "@playwright/test";

test.describe("admin auth guard", () => {
  test("unauthenticated dashboard visitor is redirected to login with callback", async ({ page }) => {
    await page.goto("/dashboard/settings");

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard%2Fsettings$/);
    await expect(page.getByRole("heading", { name: "Talvyn" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("login page keeps unsafe callback URLs inert before credential submission", async ({ page }) => {
    await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.example%2Fsteal");

    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/login\?callbackUrl=https%3A%2F%2Fevil\.example%2Fsteal$/);
    await expect(
      page.getByRole("alert").filter({ hasText: "Enter a valid email address" })
    ).toBeVisible();
  });
});
