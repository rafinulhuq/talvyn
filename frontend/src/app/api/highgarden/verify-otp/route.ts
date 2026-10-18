import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  HIGHGARDEN_OTP_COOKIE,
  HIGHGARDEN_UNLOCK_COOKIE,
  createUnlockCookieValue,
  highgardenOtpMaxAge,
  highgardenUnlockMaxAge,
  verifyOtpPendingCookie,
} from "@/lib/highgarden";
import { notifyHighgardenUnlocked } from "@/lib/highgardenNotifications";

const otpSchema = z.object({
  code: z.string().min(4).max(10),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = otpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the verification code." }, { status: 400 });
  }

  const pending = req.cookies.get(HIGHGARDEN_OTP_COOKIE)?.value;
  const result = verifyOtpPendingCookie(pending, parsed.data.code);

  if (!result.ok) {
    const message =
      result.reason === "mismatch"
        ? "Incorrect code."
        : "Code expired or too many attempts — go back and re-enter the passphrase.";
    const response = NextResponse.json({ error: message }, { status: 401 });
    if (result.cookieValue) {
      response.cookies.set(HIGHGARDEN_OTP_COOKIE, result.cookieValue, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: highgardenOtpMaxAge,
      });
    } else {
      response.cookies.delete(HIGHGARDEN_OTP_COOKIE);
    }
    return response;
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(HIGHGARDEN_OTP_COOKIE);
  response.cookies.set(HIGHGARDEN_UNLOCK_COOKIE, createUnlockCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: highgardenUnlockMaxAge,
  });

  // Best-effort — never block granting access on this send succeeding.
  notifyHighgardenUnlocked().catch((err) => {
    console.error("[highgarden verify-otp] failed to send unlock confirmation:", err);
  });

  return response;
}
