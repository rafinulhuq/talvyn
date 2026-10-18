import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }
  if (session.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only a Super Admin can change account status." } },
      { status: 403 }
    );
  }

  const [{ id }, body] = await Promise.all([params, req.json().catch(() => null)]);
  const isActive = body?.isActive;
  if (typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: { code: "INVALID_STATUS", message: "isActive must be a boolean." } },
      { status: 400 }
    );
  }

  // Deactivating your own account would either silently fail to take
  // effect this session (the JWT keeps working until it expires) or, on a
  // future re-login, lock you out with no other Super Admin guaranteed to
  // be reachable. Simplest safe rule: you can never change your own status.
  if (id === session.user.id) {
    return NextResponse.json(
      { error: { code: "SELF_STATUS_CHANGE", message: "You can't deactivate your own account." } },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "User not found." } },
      { status: 404 }
    );
  }

  // Same lockout principle as the role-change guard: never deactivate the
  // last active Super Admin, or nobody is left who can manage accounts.
  if (target.role === Role.SUPER_ADMIN && !isActive) {
    const activeSuperAdminCount = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, isActive: true },
    });
    if (activeSuperAdminCount <= 1) {
      return NextResponse.json(
        {
          error: {
            code: "LAST_SUPER_ADMIN",
            message: "Can't deactivate the last active Super Admin. Promote another admin first.",
          },
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return NextResponse.json({ user: updated });
}
