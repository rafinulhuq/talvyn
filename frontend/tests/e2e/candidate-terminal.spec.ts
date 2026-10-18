import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const terminalPages = [
  {
    path: "/test/complete",
    heading: "Assessment submitted",
    body: /your assessment has been received/i,
  },
  {
    path: "/test/expired",
    heading: "This link has expired",
    body: /assessment links are valid for 72 hours/i,
  },
];

test.describe("candidate terminal pages", () => {
  for (const { path, heading, body } of terminalPages) {
    test(`${path} renders clear candidate guidance`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole("banner")).toContainText("Assessment Platform");
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByText(body)).toBeVisible();
    });

    test(`${path} has no critical or serious axe violations`, async ({ page }) => {
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blockingViolations = results.violations.filter((violation) =>
        violation.impact === "critical" || violation.impact === "serious"
      );

      expect(blockingViolations, `${path} has blocking accessibility violations`).toEqual([]);
    });
  }
});
