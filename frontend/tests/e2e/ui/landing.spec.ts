import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("landing renders with a primary action and working nav", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request access" }).first()).toBeVisible();
    await page.getByRole("link", { name: "Blog" }).first().click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByRole("heading", { level: 1, name: "Blog" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("robots, sitemap and RSS respond", async ({ request }) => {
    expect((await request.get("/robots.txt")).status()).toBe(200);
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<urlset");
    const feed = await request.get("/blog/feed.xml");
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain("<rss");
  });

  test("unknown pages get a real 404", async ({ page }) => {
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
  });

  for (const path of ["/", "/blog", "/login", "/signup"]) {
    test(`${path} has no horizontal scroll at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
