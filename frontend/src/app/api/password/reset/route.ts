import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { passwordConfirmationSchema } from "@/lib/auth/passwordPolicy";
import { redeemPasswordReset, notifyPasswordChanged, RESET_TOKEN_PATTERN } from "@/lib/auth/passwordReset";
import { takePasswordResetAttempt } from "@/lib/auth/passwordResetRateLimit";
import { getForwardedClientIp } from "@/lib/server/clientIp";

const schema = passwordConfirmationSchema.and(z.object({ token: z.string().regex(RESET_TOKEN_PATTERN) }));

export async function POST(req: NextRequest) {
  if (!takePasswordResetAttempt(`redeem-ip:${getForwardedClientIp(req) ?? "unknown"}`, 20)) {
    return NextResponse.json({ error: { message: "Too many requests. Try again in 15 minutes." } }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Check your passwords and use a valid reset link." } }, { status: 400 });
  }
  try {
    const user = await redeemPasswordReset(parsed.data.token, parsed.data.password);
    if (!user) return NextResponse.json({ error: { message: "This reset link is invalid or expired. Request a new one." } }, { status: 400 });
    after(() => notifyPasswordChanged(user.email, user.name));
    return NextResponse.json({ message: "Password reset. Sign in with your new password." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[password-reset] Reset failed");
    return NextResponse.json({ error: { message: "Unable to reset your password. Please try again." } }, { status: 500 });
  }
}
