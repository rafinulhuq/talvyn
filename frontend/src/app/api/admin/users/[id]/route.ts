import { NextResponse, type NextRequest } from "next/server";
import { isLastActiveSuperAdmin, lastSuperAdminError, superAdminTarget } from "@/server/admin-users";
import { prisma } from "@/server/prisma";
import { isProtectedSuperAdminId } from "@/server/protected-accounts";
import { errorJson } from "@/server/upstream";

/**
 * Soft-delete ("Remove"). Never a hard DELETE: job_descriptions.uploaded_by and
 * invitations.invited_by are required FKs without ON DELETE, so Postgres would
 * reject removing anyone who ever uploaded a JD or sent an invitation.
 * Reversible via ./restore.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = await superAdminTarget(req, ctx, { requireJson: false });
  if (t.response) return t.response;
  if (t.id === t.actor.id) return errorJson(400, "SELF_REMOVAL", "You can't remove your own account.");
  if (isProtectedSuperAdminId(t.id)) return errorJson(403, "PROTECTED_ACCOUNT", "This account can't be removed.");

  const target = await prisma.user.findUnique({ where: { id: t.id } });
  if (!target || target.deletedAt) return errorJson(404, "NOT_FOUND", "User not found.");
  if (await isLastActiveSuperAdmin(target)) return lastSuperAdminError("remove");

  const user = await prisma.user.update({
    where: { id: t.id },
    data: { deletedAt: new Date() },
    select: { id: true, email: true, name: true },
  });
  return NextResponse.json({ user });
}
