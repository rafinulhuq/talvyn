import "server-only";

import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const HIGHGARDEN_UNLOCK_COOKIE = "hg_unlocked";
const UNLOCK_TTL_SECONDS = 4 * 60 * 60;

export const HIGHGARDEN_OTP_COOKIE = "hg_otp_pending";
const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;

function signingSecret(): string {
  return process.env.HIGHGARDEN_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function highgardenConfigured(): boolean {
  return Boolean(process.env.HIGHGARDEN_PASSPHRASE_HASH && signingSecret());
}

export function createUnlockCookieValue(now = Date.now()): string {
  const expiresAt = now + UNLOCK_TTL_SECONDS * 1000;
  const payload = `${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyUnlockCookie(value: string | undefined, now = Date.now()): boolean {
  if (!value || !signingSecret()) return false;
  const [expiresAtRaw, signature] = value.split(".");
  if (!expiresAtRaw || !signature) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  return safeEqual(signature, sign(expiresAtRaw));
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/** A random 6-digit code, zero-padded (e.g. "042917"). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Builds the signed "OTP pending" cookie value: expiry, remaining attempts,
 * and a hash of the code (never the code itself) — mirrors the unlock
 * cookie's payload+signature shape above. Nothing about the OTP is stored
 * server-side; the cookie itself is the only state, same as the unlock flow.
 */
export function createOtpPendingCookieValue(otp: string, now = Date.now()): string {
  const expiresAt = now + OTP_TTL_SECONDS * 1000;
  const payload = `${expiresAt}.${OTP_MAX_ATTEMPTS}.${hashOtp(otp)}`;
  return `${payload}.${sign(payload)}`;
}

export interface OtpVerifyResult {
  ok: boolean;
  /** Reason for failure. "mismatch" means retry is still possible. */
  reason?: "expired" | "no_attempts" | "mismatch" | "invalid";
  /** On a "mismatch", the cookie value to re-set with attempts decremented. */
  cookieValue?: string;
}

/**
 * Verifies a submitted code against the pending cookie. A wrong code
 * decrements the attempt counter and hands back a replacement cookie value
 * (the caller re-sets it) rather than deleting it outright, so a few
 * fat-fingered digits don't force restarting from the passphrase step.
 */
export function verifyOtpPendingCookie(
  value: string | undefined,
  submittedOtp: string,
  now = Date.now()
): OtpVerifyResult {
  if (!value || !signingSecret()) return { ok: false, reason: "invalid" };
  const parts = value.split(".");
  if (parts.length !== 4) return { ok: false, reason: "invalid" };
  const [expiresAtRaw, attemptsRaw, otpHash, signature] = parts;
  const payload = `${expiresAtRaw}.${attemptsRaw}.${otpHash}`;
  if (!safeEqual(signature, sign(payload))) return { ok: false, reason: "invalid" };

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return { ok: false, reason: "expired" };

  const attemptsLeft = Number(attemptsRaw);
  if (!Number.isFinite(attemptsLeft) || attemptsLeft <= 0) return { ok: false, reason: "no_attempts" };

  if (!safeEqual(hashOtp(submittedOtp), otpHash)) {
    const nextAttempts = attemptsLeft - 1;
    if (nextAttempts <= 0) return { ok: false, reason: "no_attempts" };
    const nextPayload = `${expiresAtRaw}.${nextAttempts}.${otpHash}`;
    return { ok: false, reason: "mismatch", cookieValue: `${nextPayload}.${sign(nextPayload)}` };
  }

  return { ok: true };
}

export const highgardenOtpMaxAge = OTP_TTL_SECONDS;

export async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return session;
}

export async function requireHighgardenAccess() {
  const session = await requireSuperAdmin();
  if (!highgardenConfigured()) redirect("/dashboard/highgarden/unlock?setup=1");
  const cookieStore = await cookies();
  const unlocked = verifyUnlockCookie(cookieStore.get(HIGHGARDEN_UNLOCK_COOKIE)?.value);
  if (!unlocked) redirect("/dashboard/highgarden/unlock");
  return session;
}

export const highgardenUnlockMaxAge = UNLOCK_TTL_SECONDS;
