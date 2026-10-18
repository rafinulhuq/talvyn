import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { isProtectedSuperAdminId } from "@/lib/protectedAccounts";

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
      { error: { code: "FORBIDDEN", message: "Only a Super Admin can change roles." } },
      { status: 403 }
    );
  }

  const [{ id }, body] = await Promise.all([params, req.json().catch(() => null)]);
  const nextRole = body?.role;
  if (
    nextRole !== Role.USER &&
    nextRole !== Role.ADMIN &&
    nextRole !== Role.SUPER_ADMIN &&
    nextRole !== Role.DEV
  ) {
    return NextResponse.json(
      { error: { code: "INVALID_ROLE", message: "Role must be USER, ADMIN, SUPER_ADMIN, or DEV." } },
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

  // Locked account: this Super Admin's role is permanently pinned (see
  // frontend/src/lib/protectedAccounts.ts) after it was accidentally
  // demoted to USER once already. Even another Super Admin can't touch it
  // — a database trigger (alembic c4f9e2a7d1b8) enforces the same rule at
  // the DB layer, so this is just the friendly error message.
  if (isProtectedSuperAdminId(target.id) && nextRole !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      {
        error: {
          code: "PROTECTED_ACCOUNT",
          message: "This account's role is permanently locked to Super Admin and cannot be changed.",
        },
      },
      { status: 403 }
    );
  }

  // Lockout guard: never let the last remaining Super Admin demote
  // themselves (or be demoted) — that would leave nobody able to manage
  // roles at all, including re-promoting anyone. Any demotion counts, not
  // just SUPER_ADMIN -> ADMIN: demoting straight to USER used to slip past
  // this check entirely.
  if (target.role === Role.SUPER_ADMIN && nextRole !== Role.SUPER_ADMIN) {
    const superAdminCount = await prisma.user.count({ where: { role: Role.SUPER_ADMIN } });
    if (superAdminCount <= 1) {
      return NextResponse.json(
        {
          error: {
            code: "LAST_SUPER_ADMIN",
            message: "Can't demote the last Super Admin. Promote another admin first.",
          },
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: nextRole },
    select: { id: true, email: true, name: true, role: true },
  });

  return NextResponse.json({ user: updated });
}
