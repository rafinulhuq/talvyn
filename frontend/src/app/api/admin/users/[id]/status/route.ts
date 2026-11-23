import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isLastActiveSuperAdmin, lastSuperAdminError, superAdminTarget } from "@/server/admin-users";
import { prisma } from "@/server/prisma";
import { readJson } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({ isActive: z.boolean() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = await superAdminTarget(req, ctx);
  if (t.response) return t.response;
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "INVALID_STATUS", "isActive must be true or false.");
  // Changing your own status either doesn't apply this session or locks you out later.
  if (t.id === t.actor.id) return errorJson(400, "SELF_STATUS_CHANGE", "You can't deactivate your own account.");

  const target = await prisma.user.findUnique({ where: { id: t.id } });
  if (!target) return errorJson(404, "NOT_FOUND", "User not found.");
  if (!parsed.data.isActive && (await isLastActiveSuperAdmin(target))) return lastSuperAdminError("deactivate");

  const user = await prisma.user.update({
    where: { id: t.id },
    data: { isActive: parsed.data.isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  return NextResponse.json({ user });
}
