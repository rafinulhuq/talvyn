import type { JWT } from "next-auth/jwt";
import { prisma } from "@/server/prisma";

/**
 * Re-validate a signed session cookie against the DB. A valid signature alone
 * can't detect a password reset (sessionVersion bump), deactivation, or a
 * revoked signup approval — so every privileged path calls this.
 */
export async function currentSessionUser(token: JWT) {
  const id = token.sub ?? token.id;
  if (!id || token.invalidated) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, signupStatus: true, sessionVersion: true, deletedAt: true },
  });
  if (
    !user ||
    !user.isActive ||
    user.deletedAt ||
    user.signupStatus !== "APPROVED" ||
    user.sessionVersion !== (token.sessionVersion ?? 0) // pre-versioning cookies count as version 0
  ) {
    return null;
  }
  return user;
}
