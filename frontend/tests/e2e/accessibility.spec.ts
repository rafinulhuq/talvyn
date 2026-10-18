import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("accessibility smoke", () => {
  test("login page exposes labelled controls and keyboard order", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Talvyn" })).toBeVisible();

    const email = page.getByLabel("Email address");
    const password = page.getByLabel("Password");
    const submit = page.getByRole("button", { name: "Sign in" });

    await expect(email).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
  });

  test("login validation errors are announced and associated with fields", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Enter a valid email address" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Password is required" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  });

  test("public pages have no critical or serious axe violations", async ({ page }) => {
    for (const path of ["/", "/login"]) {
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blockingViolations = results.violations.filter((violation) =>
        violation.impact === "critical" || violation.impact === "serious"
      );

      expect(blockingViolations, `${path} has blocking accessibility violations`).toEqual([]);
    }
  });
});
