import { Role } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isLastActiveSuperAdmin, lastSuperAdminError, superAdminTarget } from "@/server/admin-users";
import { prisma } from "@/server/prisma";
import { isProtectedSuperAdminId } from "@/server/protected-accounts";
import { readJson } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({ role: z.enum(Role) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = await superAdminTarget(req, ctx);
  if (t.response) return t.response;
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "INVALID_ROLE", "Choose User, Admin, Super Admin or Dev.");
  const nextRole = parsed.data.role;

  const target = await prisma.user.findUnique({ where: { id: t.id } });
  if (!target) return errorJson(404, "NOT_FOUND", "User not found.");
  // Friendly message only — the DB trigger trg_protect_superadmin_role is the real guarantee.
  if (isProtectedSuperAdminId(target.id) && nextRole !== Role.SUPER_ADMIN) {
    return errorJson(403, "PROTECTED_ACCOUNT", "This account's role is locked to Super Admin.");
  }
  // Any demotion of the last active Super Admin locks everyone out of role management.
  if (nextRole !== Role.SUPER_ADMIN && (await isLastActiveSuperAdmin(target))) return lastSuperAdminError("demote");

  const user = await prisma.user.update({
    where: { id: t.id },
    data: { role: nextRole },
    select: { id: true, email: true, name: true, role: true },
  });
  return NextResponse.json({ user });
}
