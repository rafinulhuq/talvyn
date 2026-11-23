import { NextResponse, type NextRequest } from "next/server";
import { superAdminTarget } from "@/server/admin-users";
import { prisma } from "@/server/prisma";
import { errorJson } from "@/server/upstream";

/** Undo "Remove" (clears deletedAt). Restoring is the safe direction, so no confirmation. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = await superAdminTarget(req, ctx, { requireJson: false });
  if (t.response) return t.response;
  const target = await prisma.user.findUnique({ where: { id: t.id } });
  if (!target?.deletedAt) return errorJson(404, "NOT_FOUND", "No removed account with that id.");
  const user = await prisma.user.update({
    where: { id: t.id },
    data: { deletedAt: null },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  return NextResponse.json({ user });
}
