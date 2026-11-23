import bcrypt from "bcryptjs";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { passwordConfirmationSchema } from "@/lib/auth/password-policy";
import { superAdminTarget } from "@/server/admin-users";
import { notifyPasswordChanged, requestPasswordReset } from "@/server/auth/password-reset";
import { prisma } from "@/server/prisma";
import { createRateLimiter, loginLimiter } from "@/server/rate-limit";
import { readJson } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const adminResetLimiter = createRateLimiter({ max: 20, windowMs: 15 * 60_000, whenFull: "reject" });

const schema = z.union([
  z.object({ action: z.literal("email") }),
  passwordConfirmationSchema.and(z.object({ action: z.literal("set") })),
]);

/** Super Admin: email the user a reset link, or set a new password (signs out all their sessions). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = await superAdminTarget(req, ctx);
  if (t.response) return t.response;
  if (!adminResetLimiter.hit(`admin:${t.actor.id}`)) return errorJson(429, "RATE_LIMITED", "Too many requests. Try again in 15 minutes.");

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form and try again.");

  try {
    const user = await prisma.user.findUnique({ where: { id: t.id } });
    if (!user) return errorJson(404, "NOT_FOUND", "User not found.");

    if (parsed.data.action === "email") {
      if (!(await requestPasswordReset(user.email))) {
        return errorJson(502, "EMAIL_FAILED", "Couldn't send the reset email. Check email delivery settings and try again.");
      }
      return NextResponse.json({ message: "Password reset email sent." });
    }

    // Conditional on the current hash + version so a concurrent change isn't overwritten.
    const result = await prisma.user.updateMany({
      where: { id: t.id, sessionVersion: user.sessionVersion, passwordHash: user.passwordHash },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
    if (result.count !== 1) return errorJson(409, "CONFLICT", "This account just changed. Refresh and try again.");
    loginLimiter.reset(user.email);
    console.info("[password-reset] Super Admin set password", { actorId: t.actor.id, targetId: t.id }); // ids only
    after(() => notifyPasswordChanged(user.email, user.name));
    return NextResponse.json({ message: "Password updated. Their existing sessions have been signed out." });
  } catch {
    console.error("[password-reset] Admin reset failed");
    return errorJson(500, "RESET_FAILED", "Couldn't reset the password. Try again.");
  }
}
