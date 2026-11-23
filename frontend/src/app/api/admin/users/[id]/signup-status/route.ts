import { SignupStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isLastActiveSuperAdmin, lastSuperAdminError, superAdminTarget } from "@/server/admin-users";
import { notifySignupDecision } from "@/server/notifications";
import { prisma } from "@/server/prisma";
import { readJson } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({ signupStatus: z.enum([SignupStatus.APPROVED, SignupStatus.REJECTED]) });

/** Approve or reject an access request. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = await superAdminTarget(req, ctx);
  if (t.response) return t.response;
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "INVALID_STATUS", "signupStatus must be APPROVED or REJECTED.");
  const { signupStatus } = parsed.data;
  if (t.id === t.actor.id) return errorJson(400, "SELF_STATUS_CHANGE", "You can't change your own access request.");

  const target = await prisma.user.findUnique({ where: { id: t.id } });
  if (!target) return errorJson(404, "NOT_FOUND", "User not found.");
  if (signupStatus === SignupStatus.REJECTED && (await isLastActiveSuperAdmin(target))) return lastSuperAdminError("reject");

  // Only email on a real transition: a double-click or stale tab must not send a second decision email.
  const changed = target.signupStatus !== signupStatus;
  const user = await prisma.user.update({
    where: { id: t.id },
    data: { signupStatus },
    select: { id: true, email: true, name: true, companyName: true, role: true, signupStatus: true },
  });
  if (changed) {
    notifySignupDecision({ toEmail: user.email, toName: user.name, decision: signupStatus }).catch((err: Error) =>
      console.error(`[signup-status] notify failed: ${err.message}`),
    );
  }
  return NextResponse.json({ user });
}
