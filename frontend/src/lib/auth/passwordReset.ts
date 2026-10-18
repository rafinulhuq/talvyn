import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearAttempts } from "./loginRateLimit";
import { newPasswordSchema } from "./passwordPolicy";

export const RESET_REQUEST_MESSAGE = "If an account exists for that email, you will receive a password reset link.";
export const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function dispatchEmail(path: string, body: Record<string, string>): Promise<boolean> {
  const base = process.env.FASTAPI_INTERNAL_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!base || !secret) return false;
  try {
    const response = await fetch(`${base}/api/v1/internal/emails/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": secret },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.sent === 1 && result.failed === 0;
  } catch {
    // Never log transport exceptions: they may include request bodies/tokens.
    return false;
  }
}

export async function requestPasswordReset(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return true;
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  // Do not issue a link against a concurrently changed password/version.
  const issued = await prisma.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion },
    data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  if (issued.count !== 1) return false;
  const sent = await dispatchEmail("password-reset", { to_email: user.email, to_name: user.name, token });
  if (!sent) {
    await prisma.user.updateMany({
      where: { id: user.id, passwordResetTokenHash: tokenHash },
      data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    console.error("[password-reset] Email delivery failed");
  }
  return sent;
}

export async function notifyPasswordChanged(email: string, name: string): Promise<void> {
  if (!await dispatchEmail("password-changed", { to_email: email, to_name: name })) {
    console.error("[password-reset] Password change notification failed");
  }
}

export async function redeemPasswordReset(token: string, password: string) {
  newPasswordSchema.parse(password);
  if (!RESET_TOKEN_PATTERN.test(token)) return null;
  const tokenHash = hashResetToken(token);
  const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash } });
  if (!user?.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) return null;
  const passwordHash = await bcrypt.hash(password, 12);
  // One conditional UPDATE consumes the token and revokes sessions. Concurrent
  // submissions cannot both succeed, even across different server processes.
  const result = await prisma.user.updateMany({
    where: { id: user.id, passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
    data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null,
      sessionVersion: { increment: 1 } },
  });
  if (result.count !== 1) return null;
  clearAttempts(user.email);
  return { email: user.email, name: user.name };
}
