/**
 * Highgarden (internal product analytics) gate. Access needs, in order:
 *   1. a live SUPER_ADMIN session,
 *   2. the Highgarden passphrase (bcrypt hash in HIGHGARDEN_PASSPHRASE_HASH),
 *   3. a one-time code emailed to a FIXED owner address (set in the backend),
 *      which doubles as a "someone is unlocking Highgarden" alert.
 * Success sets a signed, 4-hour unlock cookie.
 *
 * State is stateless signed cookies (HMAC), plus an in-process attempt
 * counter for OTPs: the old version kept the attempt count only in the
 * cookie, so replaying the original cookie gave unlimited guesses.
 */
import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { authOptions } from "@/server/auth/options";
import { requireUser } from "@/server/auth/require-user";
import { backendFetch } from "@/server/internal-api";
import { createRateLimiter } from "@/server/rate-limit";
import { errorJson } from "@/server/upstream";

export const UNLOCK_COOKIE = "hg_unlocked";
export const OTP_COOKIE = "hg_otp_pending";
export const UNLOCK_TTL_SECONDS = 4 * 60 * 60;
export const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;

// Server-side guess budget per issued code (keyed by the code's hash).
const otpGuessLimiter = createRateLimiter({ max: OTP_MAX_ATTEMPTS, windowMs: OTP_TTL_SECONDS * 1000, whenFull: "reject" });
// Passphrase attempts per Super Admin.
export const passphraseLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60_000, whenFull: "reject" });

const secret = () => process.env.HIGHGARDEN_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "";
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// A full bcrypt hash is 60 chars. Anything else (often a hash whose "$" signs
// were expanded away by a .env file) can never match, so treat it as unset.
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
export const passphraseHashValid = () => BCRYPT_HASH.test(process.env.HIGHGARDEN_PASSPHRASE_HASH ?? "");
export const highgardenConfigured = () => passphraseHashValid() && Boolean(secret());

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

// ─── Unlock cookie: "<expiresAt>.<hmac>" ──────────────────────

export function createUnlockCookieValue(now = Date.now()): string {
  const payload = String(now + UNLOCK_TTL_SECONDS * 1000);
  return `${payload}.${sign(payload)}`;
}

export function verifyUnlockCookie(value: string | undefined, now = Date.now()): boolean {
  if (!value || !secret()) return false;
  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature) return false;
  const exp = Number(expiresAt);
  return Number.isFinite(exp) && exp > now && safeEqual(signature, sign(expiresAt));
}

// ─── OTP cookie: "<expiresAt>.<attemptsLeft>.<sha256(code)>.<hmac>" ──

export const generateOtp = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

export function createOtpCookieValue(otp: string, now = Date.now()): string {
  const payload = `${now + OTP_TTL_SECONDS * 1000}.${OTP_MAX_ATTEMPTS}.${sha256(otp)}`;
  return `${payload}.${sign(payload)}`;
}

export type OtpResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "no_attempts" }
  | { ok: false; reason: "mismatch"; cookieValue: string };

export function verifyOtpCookie(value: string | undefined, submitted: string, now = Date.now()): OtpResult {
  if (!value || !secret()) return { ok: false, reason: "invalid" };
  const parts = value.split(".");
  if (parts.length !== 4) return { ok: false, reason: "invalid" };
  const [expiresAt = "", attempts = "", otpHash = "", signature = ""] = parts;
  if (!safeEqual(signature, sign(`${expiresAt}.${attempts}.${otpHash}`))) return { ok: false, reason: "invalid" };
  const exp = Number(expiresAt);
  if (!Number.isFinite(exp) || exp <= now) return { ok: false, reason: "expired" };
  const left = Number(attempts);
  if (!Number.isFinite(left) || left <= 0) return { ok: false, reason: "no_attempts" };

  // Spend a server-side guess BEFORE comparing; replaying an older cookie doesn't reset this.
  if (!otpGuessLimiter.hit(otpHash, now)) return { ok: false, reason: "no_attempts" };

  if (safeEqual(sha256(submitted), otpHash)) {
    otpGuessLimiter.reset(otpHash);
    return { ok: true };
  }
  if (left - 1 <= 0) return { ok: false, reason: "no_attempts" };
  const next = `${expiresAt}.${left - 1}.${otpHash}`;
  return { ok: false, reason: "mismatch", cookieValue: `${next}.${sign(next)}` };
}

// ─── Backend email hooks (recipient fixed server-side, never caller-supplied) ──

export async function sendOtpEmail(code: string, actorId: string): Promise<boolean> {
  const res = await backendFetch<{ sent: boolean }>("/api/v1/admin/highgarden-otp/send", {
    method: "POST",
    body: JSON.stringify({ code }),
    actorId,
    cache: "no-store",
  });
  return res.ok && res.data.sent === true;
}

export async function notifyUnlocked(actorId: string): Promise<void> {
  await backendFetch("/api/v1/admin/highgarden-otp/confirm", { method: "POST", actorId, cache: "no-store" });
}

// ─── Guards ───────────────────────────────────────────────────

/** For Highgarden pages: redirects instead of returning errors. */
export async function requireHighgardenPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");
  if (!highgardenConfigured()) redirect("/dashboard/highgarden/unlock?setup=1");
  if (!verifyUnlockCookie((await cookies()).get(UNLOCK_COOKIE)?.value)) redirect("/dashboard/highgarden/unlock");
  return session;
}

/** For Highgarden API routes: Super Admin + valid unlock cookie, JSON errors. */
export async function requireHighgardenApi(req: NextRequest) {
  const auth = await requireUser(req, "SUPER_ADMIN");
  if (auth.response) return { response: auth.response };
  if (!verifyUnlockCookie(req.cookies.get(UNLOCK_COOKIE)?.value)) {
    return { response: errorJson(403, "HIGHGARDEN_LOCKED", "Unlock Highgarden to continue.") };
  }
  return { user: auth.user };
}
