import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { passwordConfirmationSchema } from "@/lib/auth/passwordPolicy";
import { requestPasswordReset, notifyPasswordChanged } from "@/lib/auth/passwordReset";
import { takePasswordResetAttempt } from "@/lib/auth/passwordResetRateLimit";
import { clearAttempts } from "@/lib/auth/loginRateLimit";

const schema = z.union([
  z.object({ action: z.literal("email") }),
  passwordConfirmationSchema.and(z.object({ action: z.literal("set") })),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Custom cookie-authenticated mutations require same-origin JSON requests.
  if (!req.headers.get("content-type")?.startsWith("application/json") ||
      req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: { message: "Invalid request origin or content type." } }, { status: 403 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const actor = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!actor?.isActive || actor.signupStatus !== "APPROVED" || actor.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: { message: "Only a Super Admin can reset passwords." } }, { status: 403 });
  }
  if (!takePasswordResetAttempt(`admin:${actor.id}`, 20)) {
    return NextResponse.json({ error: { message: "Too many requests. Try again in 15 minutes." } }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input." } }, { status: 400 });
  const { id } = await params;
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: { message: "User not found." } }, { status: 404 });
    if (parsed.data.action === "email") {
      if (!await requestPasswordReset(user.email)) {
        return NextResponse.json({ error: { message: "Could not send the reset email. Check email delivery settings and try again." } }, { status: 502 });
      }
      return NextResponse.json({ message: "Password reset email sent." });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await prisma.user.updateMany({
      where: { id, sessionVersion: user.sessionVersion, passwordHash: user.passwordHash },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null, sessionVersion: { increment: 1 } },
    });
    if (result.count !== 1) return NextResponse.json({ error: { message: "The account changed. Refresh and try again." } }, { status: 409 });
    clearAttempts(user.email);
    // IDs only: no plaintext passwords, hashes, reset tokens, or email bodies.
    console.info("[password-reset] Super Admin reset password", { actorId: actor.id, targetId: id });
    after(() => notifyPasswordChanged(user.email, user.name));
    return NextResponse.json({ message: "Password reset. Existing sessions have been signed out." });
  } catch {
    console.error("[password-reset] Admin reset failed");
    return NextResponse.json({ error: { message: "Unable to reset password. Please try again." } }, { status: 500 });
  }
}
