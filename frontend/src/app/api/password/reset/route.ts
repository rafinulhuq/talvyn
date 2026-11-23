import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { passwordConfirmationSchema } from "@/lib/auth/password-policy";
import { notifyPasswordChanged, redeemPasswordReset, RESET_TOKEN_PATTERN } from "@/server/auth/password-reset";
import { getClientIp } from "@/server/client-ip";
import { resetRedeemIpLimiter } from "@/server/rate-limit";
import { readJson } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = passwordConfirmationSchema.and(z.object({ token: z.string().regex(RESET_TOKEN_PATTERN) }));

export async function POST(req: NextRequest) {
  if (!resetRedeemIpLimiter.hit(`ip:${getClientIp(req) ?? "unknown"}`)) {
    return errorJson(429, "RATE_LIMITED", "Too many requests. Try again in 15 minutes.");
  }
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check your passwords and use a valid reset link.");
  try {
    const user = await redeemPasswordReset(parsed.data.token, parsed.data.password);
    if (!user) return errorJson(400, "INVALID_TOKEN", "This reset link is invalid or has expired. Request a new one.");
    after(() => notifyPasswordChanged(user.email, user.name));
    return NextResponse.json({ message: "Password reset. Sign in with your new password." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[password-reset] Reset failed");
    return errorJson(500, "RESET_FAILED", "Couldn't reset your password. Try again.");
  }
}
