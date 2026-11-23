import { getToken } from "next-auth/jwt";
import type { NextRequest, NextResponse } from "next/server";
import { roleAtLeast, type RankedRole } from "@/lib/roles";
import { errorJson } from "@/server/upstream";
import { currentSessionUser } from "./session";

export type SessionUser = NonNullable<Awaited<ReturnType<typeof currentSessionUser>>>;

/**
 * Route-handler guard: verifies the session cookie AND re-checks the user in
 * the DB (active, approved, session not revoked). Role comes from the DB, not
 * the cookie, so a demotion takes effect immediately.
 */
export async function requireUser(
  req: NextRequest,
  minRole?: RankedRole,
): Promise<{ user: SessionUser; response?: never } | { user?: never; response: NextResponse }> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const user = token ? await currentSessionUser(token) : null;
  if (!user) return { response: errorJson(401, "UNAUTHORIZED", "Your session has ended. Sign in again.") };
  if (minRole && !roleAtLeast(user.role, minRole)) {
    return { response: errorJson(403, "FORBIDDEN", "You don't have access to this action.") };
  }
  return { user };
}

/** Ids interpolated into backend paths: UUIDs, slugs, numeric ids. Nothing that can alter the path. */
export const isSafeId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
