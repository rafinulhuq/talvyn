import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { newPasswordSchema } from "@/lib/auth/password-policy";
import { sendInternalEmail } from "@/server/internal-api";
import { prisma } from "@/server/prisma";
import { loginLimiter } from "@/server/rate-limit";

export const RESET_REQUEST_MESSAGE = "If an account exists for that email, you'll receive a password reset link.";
export const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const RESET_TTL_MS = 30 * 60_000;

// Only the SHA-256 of the token is stored: a DB leak can't be replayed as reset links.
export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issues and emails a reset link. Silent no-op for unknown emails (caller always returns the same message). */
export async function requestPasswordReset(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return true;

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  // Conditional on the current hash + session version, so a link is never
  // issued against a password that changed concurrently.
  const issued = await prisma.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion },
    data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  if (issued.count !== 1) return false;

  const sent = await sendInternalEmail("password-reset", { to_email: user.email, to_name: user.name, token });
  if (!sent) {
    // Don't leave a live token nobody received.
    await prisma.user.updateMany({
      where: { id: user.id, passwordResetTokenHash: tokenHash },
      data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    console.error("[password-reset] Email delivery failed");
  }
  return sent;
}

export async function notifyPasswordChanged(email: string, name: string): Promise<void> {
  if (!(await sendInternalEmail("password-changed", { to_email: email, to_name: name }))) {
    console.error("[password-reset] Password change notification failed");
  }
}

/** Consumes a reset token. Returns the user, or null if the token is invalid/expired/already used. */
export async function redeemPasswordReset(token: string, password: string) {
  newPasswordSchema.parse(password);
  if (!RESET_TOKEN_PATTERN.test(token)) return null;
  const tokenHash = hashResetToken(token);
  const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash } });
  if (!user?.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) return null;

  const passwordHash = await bcrypt.hash(password, 12);
  // One conditional UPDATE consumes the token AND revokes every session
  // (sessionVersion++). Two concurrent submissions can't both succeed, even
  // across processes, because the WHERE no longer matches after the first.
  const result = await prisma.user.updateMany({
    where: { id: user.id, passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      sessionVersion: { increment: 1 },
    },
  });
  if (result.count !== 1) return null;
  loginLimiter.reset(user.email);
  return { email: user.email, name: user.name };
}
