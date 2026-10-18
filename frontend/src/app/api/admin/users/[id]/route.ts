import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { isProtectedSuperAdminId } from "@/lib/protectedAccounts";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Soft-deletes a user account (sets deletedAt) — a Super Admin's "Remove"
 * action, confirmed client-side first. Never a hard DELETE: job_descriptions
 * .uploaded_by and invitations.invited_by are required foreign keys with no
 * ON DELETE clause, so Postgres would reject removing any user who has ever
 * uploaded a JD or sent an invitation. Restorable via the sibling
 * /restore route until someone decides otherwise — there is deliberately no
 * permanent-purge endpoint for users yet.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }
  if (session.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only a Super Admin can remove accounts." } },
      { status: 403 }
    );
  }

  const { id } = await params;

  // Same reasoning as the status route's self-guard: removing your own
  // account could either not take effect this session (stateless JWT) or
  // lock you out on next login with no guaranteed other Super Admin.
  if (id === session.user.id) {
    return NextResponse.json(
      { error: { code: "SELF_REMOVAL", message: "You can't remove your own account." } },
      { status: 400 }
    );
  }

  if (isProtectedSuperAdminId(id)) {
    return NextResponse.json(
      { error: { code: "PROTECTED_ACCOUNT", message: "This account can't be removed." } },
      { status: 403 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.deletedAt) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "User not found." } },
      { status: 404 }
    );
  }

  // Same lockout principle as the role/status guards: never remove the last
  // active Super Admin, or nobody is left who can manage accounts (or
  // restore this one).
  if (target.role === Role.SUPER_ADMIN) {
    const activeSuperAdminCount = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, isActive: true, deletedAt: null },
    });
    if (activeSuperAdminCount <= 1) {
      return NextResponse.json(
        {
          error: {
            code: "LAST_SUPER_ADMIN",
            message: "Can't remove the last active Super Admin. Promote another admin first.",
          },
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ user: updated });
}
