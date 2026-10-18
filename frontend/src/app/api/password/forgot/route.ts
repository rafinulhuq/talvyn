import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset, RESET_REQUEST_MESSAGE } from "@/lib/auth/passwordReset";
import { takePasswordResetAttempt } from "@/lib/auth/passwordResetRateLimit";
import { getForwardedClientIp } from "@/lib/server/clientIp";

export async function POST(req: NextRequest) {
  if (!takePasswordResetAttempt(`request-ip:${getForwardedClientIp(req) ?? "unknown"}`, 10)) {
    return NextResponse.json({ error: { message: "Too many requests. Try again in 15 minutes." } }, { status: 429 });
  }
  const parsed = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Enter a valid email address." } }, { status: 400 });
  }
  if (takePasswordResetAttempt(`request-email:${parsed.data.email}`, 3)) {
    // Account lookup and delivery happen AFTER the same public response, so
    // email transport timing cannot reveal whether the account exists.
    after(async () => {
      try { await requestPasswordReset(parsed.data.email); }
      catch { console.error("[password-reset] Reset request failed"); }
    });
  }
  return NextResponse.json({ message: RESET_REQUEST_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
}
