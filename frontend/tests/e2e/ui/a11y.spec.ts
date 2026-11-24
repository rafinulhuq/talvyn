import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cleanup } from "../api/helpers";
import { signInAs, unlockHighgarden } from "./session";

/**
 * Gate 2 accessibility bar: no axe violations above "minor", in both themes.
 * The backend is unreachable in this suite, so app pages are checked in their
 * error/empty states, which every screen must design for anyway.
 */
async function violationsOn(page: Page, label: string): Promise<string[]> {
  // Let entrance animations (≤220ms) settle so contrast is measured at rest.
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact !== "minor")
    .map((v) => `${label} → ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

const PUBLIC = ["/", "/blog", "/login", "/signup", "/forgot-password"];
const APP = [
  "/dashboard",
  "/dashboard/jds",
  "/dashboard/candidates",
  "/dashboard/results",
  "/dashboard/leaderboard",
  "/dashboard/templates",
  "/dashboard/ai-checker",
  "/dashboard/ats-checker",
  "/dashboard/users",
  "/dashboard/settings",
  "/dashboard/trash",
  "/dashboard/profile",
  "/dashboard/cmp",
  "/dashboard/highgarden/unlock",
];
const HIGHGARDEN = ["", "/sessions", "/funnels", "/heatmaps", "/feedback", "/alerts"].map((p) => `/dashboard/highgarden${p}`);

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("public pages", async ({ page }) => {
      const found: string[] = [];
      for (const path of PUBLIC) {
        await page.goto(path);
        found.push(...(await violationsOn(page, path)));
      }
      expect(found).toEqual([]);
    });

    test("app pages", async ({ page, context, baseURL }) => {
      test.setTimeout(120_000);
      const u = await signInAs(page, "SUPER_ADMIN");
      const found: string[] = [];
      for (const path of APP) {
        await page.goto(path);
        found.push(...(await violationsOn(page, path)));
      }
      await unlockHighgarden(context, baseURL!);
      for (const path of HIGHGARDEN) {
        await page.goto(path);
        found.push(...(await violationsOn(page, path)));
      }
      await cleanup(u.id);
      expect(found).toEqual([]);
    });
  });
}
