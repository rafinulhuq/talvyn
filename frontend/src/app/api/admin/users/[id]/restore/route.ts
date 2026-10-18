import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

interface Params {
  params: Promise<{ id: string }>;
}

/** Reverses a Super Admin's "Remove" action (clears deletedAt). No confirmation
 * dialog on the client — restoring is the safe direction, same convention as
 * "Reactivate" on the status toggle. */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }
  if (session.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only a Super Admin can restore accounts." } },
      { status: 403 }
    );
  }

  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !target.deletedAt) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "No removed account with that id." } },
      { status: 404 }
    );
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { deletedAt: null },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return NextResponse.json({ user: updated });
}
