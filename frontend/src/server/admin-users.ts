import { Role, type Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { isSafeId, requireUser, type SessionUser } from "@/server/auth/require-user";
import { prisma } from "@/server/prisma";
import { rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

/**
 * One definition of "a Super Admin who can still manage accounts", used by
 * every lockout guard. The previous routes disagreed (the role route counted
 * deactivated/removed Super Admins), which allowed demoting the last ACTIVE one.
 */
const ACTIVE_SUPER_ADMIN: Prisma.UserWhereInput = {
  role: Role.SUPER_ADMIN,
  isActive: true,
  deletedAt: null,
  signupStatus: "APPROVED",
};

export const countActiveSuperAdmins = () => prisma.user.count({ where: ACTIVE_SUPER_ADMIN });

/** True if `target` is the only remaining active Super Admin. */
export async function isLastActiveSuperAdmin(target: { role: Role; isActive: boolean; deletedAt: Date | null; signupStatus: string }) {
  const isActiveSA = target.role === Role.SUPER_ADMIN && target.isActive && !target.deletedAt && target.signupStatus === "APPROVED";
  return isActiveSA && (await countActiveSuperAdmins()) <= 1;
}

export const lastSuperAdminError = (action: string) =>
  errorJson(409, "LAST_SUPER_ADMIN", `Can't ${action} the last active Super Admin. Promote another admin first.`);

type Ctx = { params: Promise<{ id: string }> };

/** Super-Admin-only mutation on /api/admin/users/[id]: CSRF + session + role + id checks. */
export async function superAdminTarget(
  req: NextRequest,
  ctx: Ctx,
  { requireJson = true } = {},
): Promise<{ actor: SessionUser; id: string; response?: never } | { response: Response }> {
  const unsafe = rejectUnsafeMutation(req, { requireJson });
  if (unsafe) return { response: unsafe };
  const auth = await requireUser(req, "SUPER_ADMIN");
  if (auth.response) return { response: auth.response };
  const { id } = await ctx.params;
  if (!isSafeId(id)) return { response: errorJson(404, "NOT_FOUND", "User not found.") };
  return { actor: auth.user, id };
}
