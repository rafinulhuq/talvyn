import { createHash, createHmac } from "node:crypto";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { createUser, PASSWORD } from "../api/helpers";
import { E2E_HIGHGARDEN_COOKIE_SECRET } from "../constants";

type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

/** Creates a user and signs in through the real login form. Returns the user for cleanup. */
export async function signInAs(page: Page, role: Role) {
  const user = await createUser({ role });
  await page.goto("/login");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return user;
}

const sign = (v: string) => createHmac("sha256", E2E_HIGHGARDEN_COOKIE_SECRET).update(v).digest("hex");

/** A valid 4-hour Highgarden unlock cookie, signed with the e2e secret. */
export async function unlockHighgarden(context: BrowserContext, baseURL: string) {
  const payload = String(Date.now() + 4 * 3600_000);
  await context.addCookies([{ name: "hg_unlocked", value: `${payload}.${sign(payload)}`, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

/** A pending-code cookie for a known code, as /api/highgarden/unlock would set after emailing it. */
export async function pendingCode(context: BrowserContext, baseURL: string, code: string) {
  const payload = `${Date.now() + 5 * 60_000}.5.${createHash("sha256").update(code).digest("hex")}`;
  await context.addCookies([{ name: "hg_otp_pending", value: `${payload}.${sign(payload)}`, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}
