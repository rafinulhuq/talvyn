import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  HIGHGARDEN_OTP_COOKIE,
  createOtpPendingCookieValue,
  generateOtp,
  highgardenConfigured,
  highgardenOtpMaxAge,
} from "@/lib/highgarden";
import { sendHighgardenOtpEmail } from "@/lib/highgardenNotifications";

const unlockSchema = z.object({
  passphrase: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!highgardenConfigured()) {
    return NextResponse.json({ error: "Highgarden is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = unlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the Highgarden passphrase." }, { status: 400 });
  }

  const ok = await bcrypt.compare(
    parsed.data.passphrase,
    process.env.HIGHGARDEN_PASSPHRASE_HASH as string
  );
  if (!ok) {
    return NextResponse.json({ error: "Passphrase was not accepted." }, { status: 401 });
  }

  // The passphrase alone no longer grants access — a one-time code emailed
  // to the fixed HighGarden owner address is required next. That email
  // also doubles as the "someone is trying to log in" notification, so a
  // correct passphrase with a stolen/hijacked Super Admin session still
  // can't reach HighGarden silently.
  const otp = generateOtp();
  const emailed = await sendHighgardenOtpEmail(otp);
  if (!emailed) {
    return NextResponse.json(
      { error: "Could not send the verification code. Try again shortly." },
      { status: 502 }
    );
  }

  const response = NextResponse.json({ otpRequired: true });
  response.cookies.set(HIGHGARDEN_OTP_COOKIE, createOtpPendingCookieValue(otp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: highgardenOtpMaxAge,
  });
  return response;
}
