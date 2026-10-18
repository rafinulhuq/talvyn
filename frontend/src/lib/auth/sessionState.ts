import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

/** A cookie signature alone cannot detect a password reset or deactivation. */
export async function currentSessionUser(token: JWT) {
  const id = token.sub ?? token.id;
  if (!id || token.invalidated) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, signupStatus: true, sessionVersion: true },
  });
  // Older cookies are version zero. A reset invalidates those cookies too.
  if (!user || !user.isActive || user.signupStatus !== "APPROVED" ||
      user.sessionVersion !== (token.sessionVersion ?? 0)) return null;
  return user;
}
