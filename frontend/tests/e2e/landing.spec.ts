import { expect, test } from "@playwright/test";

test.describe("public landing flow", () => {
  test("visitor can navigate from landing page to login", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /hire the best candidates/i })
    ).toBeVisible();

    const primaryCta = page.getByRole("link", { name: /start for free/i }).first();
    await expect(primaryCta).toHaveAttribute("href", "/login");

    await primaryCta.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Talvyn" })).toBeVisible();
  });

  test("visitor can jump to the how-it-works section", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /see how it works/i }).first().click();

    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(
      page.getByRole("heading", { name: /from jd to ranked candidates/i })
    ).toBeVisible();
  });
});
