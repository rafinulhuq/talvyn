import { expect, test } from "@playwright/test";
import { cleanup, prisma } from "../api/helpers";
import { E2E_HIGHGARDEN_PASSPHRASE } from "../constants";
import { pendingCode, signInAs, unlockHighgarden } from "./session";

const sessionIds: string[] = [];
test.afterAll(async () => {
  await prisma.visitorSession.deleteMany({ where: { id: { in: sessionIds } } });
});

test.describe("tracking (public)", () => {
  test("page views and feedback are stored, widget clicks are not", async ({ page, context }) => {
    await page.goto("/blog");
    // The tracker sets hg_sid after hydration.
    let sid: string | undefined;
    await expect.poll(async () => (sid = (await context.cookies()).find((c) => c.name === "hg_sid")?.value)).toBeTruthy();
    sessionIds.push(sid!);
    await expect.poll(() => prisma.trackedEvent.count({ where: { sessionId: sid, type: "PAGE_VIEW", path: "/blog" } })).toBe(1);

    await page.getByRole("button", { name: "Feedback" }).click();
    await page.getByRole("button", { name: "3", exact: true }).click();
    await page.getByRole("button", { name: "Slow" }).click();
    await page.getByLabel(/Details/).fill("E2E spec feedback");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText("Thanks, your feedback was sent.")).toBeVisible();

    await expect.poll(() => prisma.highgardenFeedback.count({ where: { sessionId: sid, rating: 3, category: "Slow" } })).toBe(1);
    // The popover is portaled; it must still be excluded from click tracking.
    expect(await prisma.trackedEvent.count({ where: { sessionId: sid, type: { in: ["CLICK", "DEAD_CLICK"] } } })).toBe(0);
  });

  test("the feedback button is hidden during a test", async ({ page }) => {
    await page.goto("/tests/session");
    await expect(page.getByRole("button", { name: "Feedback" })).toHaveCount(0);
  });
});

test.describe("unlock", () => {
  test("wrong passphrase, then a right one whose email can't be sent (backend down)", async ({ page }) => {
    const u = await signInAs(page, "SUPER_ADMIN");
    await page.goto("/dashboard/highgarden");
    await expect(page).toHaveURL(/\/dashboard\/highgarden\/unlock$/);

    await page.getByLabel("Highgarden passphrase").fill("not-it");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("That passphrase wasn't accepted.")).toBeVisible();

    await page.getByLabel("Highgarden passphrase").fill(E2E_HIGHGARDEN_PASSPHRASE);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Couldn't send the verification code")).toBeVisible();
    await expect(page.getByLabel("Verification code")).toHaveCount(0);
    await cleanup(u.id);
  });

  test("emailed code: a wrong code keeps you on the step, the right one unlocks; Lock ends it", async ({ page, context, baseURL }) => {
    const u = await signInAs(page, "SUPER_ADMIN");
    await pendingCode(context, baseURL!, "482913");
    await page.goto("/dashboard/highgarden/unlock");
    await page.getByLabel("Verification code").fill("000000");
    await page.getByRole("button", { name: "Verify and unlock" }).click();
    await expect(page.getByText("That code isn't right")).toBeVisible();

    await page.getByLabel("Verification code").fill("482913");
    await page.getByRole("button", { name: "Verify and unlock" }).click();
    await expect(page).toHaveURL(/\/dashboard\/highgarden$/);
    await expect(page.getByRole("heading", { level: 1, name: "Highgarden" })).toBeVisible();

    await page.getByRole("button", { name: "Lock" }).click();
    await expect(page).toHaveURL(/\/dashboard\/highgarden\/unlock$/);
    await page.goto("/dashboard/highgarden/sessions");
    await expect(page).toHaveURL(/\/unlock$/);
    await cleanup(u.id);
  });

  test("admins below Super Admin can't reach it, and the API says so", async ({ page }) => {
    const u = await signInAs(page, "ADMIN");
    await page.goto("/dashboard/highgarden");
    await expect(page).toHaveURL(/\/dashboard$/);
    const status = await page.evaluate(async () => (await fetch("/api/highgarden/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "retention" }) })).status);
    expect(status).toBe(403);
    await cleanup(u.id);
  });
});

test.describe("analytics (unlocked)", () => {
  test("sections show seeded data, and feedback can be marked read", async ({ page, context, baseURL }) => {
    const sid = `e2e-hg-${Date.now()}`;
    sessionIds.push(sid);
    const path = `/e2e-${Date.now()}`;
    await prisma.visitorSession.create({ data: { id: sid, userAgent: "e2e" } });
    await prisma.trackedEvent.createMany({
      data: [
        { sessionId: sid, type: "PAGE_VIEW", path, deviceType: "desktop", browserName: "Chrome" },
        { sessionId: sid, type: "CLICK", path, targetLabel: "Start free trial", targetSelector: "button", xPct: 40, yPct: 30, deviceType: "desktop" },
        { sessionId: sid, type: "DEAD_CLICK", path, targetLabel: "Pricing table", targetSelector: "div", xPct: 42, yPct: 31, deviceType: "desktop" },
        { sessionId: sid, type: "CLIENT_ERROR", path, targetLabel: "Cannot read properties of undefined", targetSelector: "window.error" },
      ],
    });
    const fb = await prisma.highgardenFeedback.create({ data: { sessionId: sid, path, rating: 1, category: "Bug", comment: "E2E seeded complaint" } });

    const u = await signInAs(page, "SUPER_ADMIN");
    await unlockHighgarden(context, baseURL!);

    await page.goto("/dashboard/highgarden?days=today");
    await expect(page.getByText("Cannot read properties of undefined")).toBeVisible();
    await expect(page.getByText("Pricing table")).toBeVisible();

    await page.goto(`/dashboard/highgarden/sessions?q=${encodeURIComponent(path)}`);
    await page.getByRole("link", { name: path }).click();
    await expect(page.getByRole("heading", { name: `Session ${sid.slice(0, 8)}` })).toBeVisible();
    await expect(page.getByText("Start free trial")).toBeVisible();
    await expect(page.getByText("E2E seeded complaint")).toBeVisible();

    await page.goto(`/dashboard/highgarden/heatmaps?path=${encodeURIComponent(path)}`);
    await expect(page.getByText("2 clicks with a position, 1 dead.")).toBeVisible();

    await page.goto("/dashboard/highgarden/funnels");
    await expect(page.getByRole("heading", { name: "Invitation to score" })).toBeVisible();

    await page.goto("/dashboard/highgarden/feedback?status=UNREAD");
    const item = page.locator("li", { hasText: "E2E seeded complaint" });
    await item.getByRole("button", { name: "Mark read" }).click();
    await expect.poll(async () => (await prisma.highgardenFeedback.findUnique({ where: { id: fb.id } }))?.status).toBe("READ");

    // Purge needs a filter; a bad date range is refused.
    const res = await page.evaluate(async () =>
      (await fetch("/api/highgarden/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "filter", from: "2026-02-02", to: "2026-01-01" }) })).status,
    );
    expect(res).toBe(400);

    await prisma.highgardenFeedback.delete({ where: { id: fb.id } });
    await cleanup(u.id);
  });

  test("CSV export downloads with a header row", async ({ page, context, baseURL }) => {
    const u = await signInAs(page, "SUPER_ADMIN");
    await unlockHighgarden(context, baseURL!);
    const res = await page.request.get("/api/highgarden/exports/funnels?days=7");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toContain("highgarden-funnels-7d.csv");
    expect((await res.text()).split("\n")[0]).toContain(",");
    await cleanup(u.id);
  });
});
