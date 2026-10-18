import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, SignupStatus } from "@prisma/client";
import { notifySignupDecision } from "@/lib/signupNotifications";

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
      { error: { code: "FORBIDDEN", message: "Only a Super Admin can review access requests." } },
      { status: 403 }
    );
  }

  const [{ id }, body] = await Promise.all([params, req.json().catch(() => null)]);
  const signupStatus = body?.signupStatus;
  if (signupStatus !== SignupStatus.APPROVED && signupStatus !== SignupStatus.REJECTED) {
    return NextResponse.json(
      { error: { code: "INVALID_STATUS", message: "signupStatus must be APPROVED or REJECTED." } },
      { status: 400 }
    );
  }

  // Same reasoning as the status-toggle route's self-change guard: rejecting
  // your own account would lock you out with no other Super Admin
  // guaranteed to be reachable to reverse it.
  if (id === session.user.id) {
    return NextResponse.json(
      { error: { code: "SELF_STATUS_CHANGE", message: "You can't change your own access request status." } },
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

  // Same lockout principle as the role-change and status-toggle guards:
  // never reject the last active Super Admin (reachable only if this
  // account's role was changed to SUPER_ADMIN via the role route while
  // still pending/rejected — defense in depth, not the common path).
  if (target.role === Role.SUPER_ADMIN && signupStatus === SignupStatus.REJECTED) {
    const activeSuperAdminCount = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, isActive: true },
    });
    if (activeSuperAdminCount <= 1) {
      return NextResponse.json(
        {
          error: {
            code: "LAST_SUPER_ADMIN",
            message: "Can't reject the last active Super Admin.",
          },
        },
        { status: 409 }
      );
    }
  }

  // Captured before the write: the notification below must fire on a real
  // transition only. Re-submitting an approval (a double-click, a stale tab,
  // a retry) would otherwise send the requester a second "you're approved"
  // email for a decision that was already made and already announced.
  const statusChanged = target.signupStatus !== signupStatus;

  const updated = await prisma.user.update({
    where: { id },
    data: { signupStatus },
    select: { id: true, email: true, name: true, companyName: true, role: true, signupStatus: true },
  });

  // Best-effort — the status change has already succeeded regardless of
  // whether the requester actually gets notified.
  if (statusChanged) {
    notifySignupDecision({ toEmail: updated.email, toName: updated.name, decision: signupStatus }).catch((err) => {
      console.error("[signup-status PATCH] failed to notify requester:", err);
    });
  }

  return NextResponse.json({ user: updated });
}
