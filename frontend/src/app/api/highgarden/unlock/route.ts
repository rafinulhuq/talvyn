import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import {
  OTP_COOKIE,
  OTP_TTL_SECONDS,
  cookieOptions,
  createOtpCookieValue,
  generateOtp,
  highgardenConfigured,
  passphraseLimiter,
  sendOtpEmail,
} from "@/server/highgarden";
import { readJson, rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({ passphrase: z.string().min(1).max(500) });

/** Step 1: passphrase. On success, email a one-time code and set the pending-OTP cookie. */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeMutation(req);
  if (unsafe) return unsafe;
  const auth = await requireUser(req, "SUPER_ADMIN");
  if (auth.response) return auth.response;
  if (!highgardenConfigured()) return errorJson(503, "NOT_CONFIGURED", "Highgarden isn't configured on this server.");
  if (!passphraseLimiter.hit(auth.user.id)) return errorJson(429, "RATE_LIMITED", "Too many attempts. Try again in 15 minutes.");

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", "Enter the Highgarden passphrase.");
  if (!(await bcrypt.compare(parsed.data.passphrase, process.env.HIGHGARDEN_PASSPHRASE_HASH as string))) {
    return errorJson(401, "WRONG_PASSPHRASE", "That passphrase wasn't accepted.");
  }

  const otp = generateOtp();
  if (!(await sendOtpEmail(otp, auth.user.id))) {
    return errorJson(502, "OTP_EMAIL_FAILED", "Couldn't send the verification code. Try again shortly.");
  }
  const res = NextResponse.json({ otpRequired: true });
  res.cookies.set(OTP_COOKIE, createOtpCookieValue(otp), cookieOptions(OTP_TTL_SECONDS));
  return res;
}
