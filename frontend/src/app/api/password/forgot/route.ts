import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeEmail } from "@/lib/auth/password-policy";
import { RESET_REQUEST_MESSAGE, requestPasswordReset } from "@/server/auth/password-reset";
import { getClientIp } from "@/server/client-ip";
import { resetRequestEmailLimiter, resetRequestIpLimiter } from "@/server/rate-limit";
import { readJson } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({ email: z.email().max(255).transform(normalizeEmail) });

export async function POST(req: NextRequest) {
  if (!resetRequestIpLimiter.hit(`ip:${getClientIp(req) ?? "unknown"}`)) {
    return errorJson(429, "RATE_LIMITED", "Too many requests. Try again in 15 minutes.");
  }
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", "Enter a valid email address.");

  // Lookup and delivery run AFTER the identical public response, so neither
  // response content nor timing reveals whether the account exists.
  if (resetRequestEmailLimiter.hit(`email:${parsed.data.email}`)) {
    after(async () => {
      try {
        await requestPasswordReset(parsed.data.email);
      } catch {
        console.error("[password-reset] Reset request failed");
      }
    });
  }
  return NextResponse.json({ message: RESET_REQUEST_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
}
