import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import {
  OTP_COOKIE,
  OTP_TTL_SECONDS,
  UNLOCK_COOKIE,
  UNLOCK_TTL_SECONDS,
  cookieOptions,
  createUnlockCookieValue,
  notifyUnlocked,
  verifyOtpCookie,
} from "@/server/highgarden";
import { readJson, rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/** Step 2: emailed code → 4-hour unlock cookie. */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeMutation(req);
  if (unsafe) return unsafe;
  const auth = await requireUser(req, "SUPER_ADMIN");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", "Enter the 6-digit code from the email.");

  const result = verifyOtpCookie(req.cookies.get(OTP_COOKIE)?.value, parsed.data.code);
  if (!result.ok) {
    const res =
      result.reason === "mismatch"
        ? errorJson(401, "WRONG_CODE", "That code isn't right. Check the email and try again.")
        : errorJson(401, "CODE_EXPIRED", "This code has expired or has no attempts left. Enter the passphrase again.");
    if (result.reason === "mismatch") res.cookies.set(OTP_COOKIE, result.cookieValue, cookieOptions(OTP_TTL_SECONDS));
    else res.cookies.delete(OTP_COOKIE);
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(OTP_COOKIE);
  res.cookies.set(UNLOCK_COOKIE, createUnlockCookieValue(), cookieOptions(UNLOCK_TTL_SECONDS));
  notifyUnlocked(auth.user.id).catch((err: Error) => console.error(`[highgarden] unlock notice failed: ${err.message}`));
  return res;
}
