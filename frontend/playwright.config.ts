import { defineConfig } from "@playwright/test";

/**
 * E2E suites hit a real database. They run ONLY against an explicitly named
 * throwaway DB (E2E_DATABASE_URL) — never a default — so a stray run can't
 * touch dev or production data. Tests create and delete their own e2e-* users.
 */
const dbUrl = process.env.E2E_DATABASE_URL;
if (!dbUrl && !process.env.PLAYWRIGHT_BASE_URL) {
  throw new Error("Set E2E_DATABASE_URL to a throwaway Postgres (schema via `prisma db push`) before running e2e tests.");
}
if (dbUrl) process.env.DATABASE_URL = dbUrl; // for the test process's own Prisma client

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3200);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // A production build, not `next dev`: closer to what ships, and it doesn't
        // collide with a developer's running dev server (one per directory).
        command: `npx next build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
        url: `${baseURL}/api/auth/csrf`,
        reuseExistingServer: !process.env.CI,
        timeout: 400_000,
        env: {
          DATABASE_URL: dbUrl ?? "",
          NEXTAUTH_SECRET: "e2e-nextauth-secret-not-for-production",
          NEXTAUTH_URL: baseURL,
          NEXT_PUBLIC_APP_URL: baseURL,
          NEXT_PUBLIC_SITE_URL: baseURL,
          INTERNAL_API_SECRET: "e2e-internal-secret-32-characters!!",
          // Nothing listens here: backend-dependent paths must degrade cleanly.
          FASTAPI_INTERNAL_URL: "http://127.0.0.1:59999",
        },
      },
  projects: [
    { name: "api", testMatch: /api\/.*\.spec\.ts/ },
    { name: "ui", testMatch: /ui\/.*\.spec\.ts/, use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
  ],
});
