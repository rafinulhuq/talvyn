/**
 * Best-effort emails for the access-request flow. Callers must never let a
 * failure here block signup or an approval decision — catch and log.
 */
import { Role } from "@prisma/client";
import { sendInternalEmail } from "@/server/internal-api";
import { prisma } from "@/server/prisma";

export async function notifySuperAdminsOfSignupRequest(p: { requesterName: string; requesterEmail: string; companyName: string }) {
  const admins = await prisma.user.findMany({ where: { role: Role.SUPER_ADMIN, isActive: true }, select: { email: true } });
  if (admins.length === 0) return;
  await sendInternalEmail("signup-request", {
    admin_emails: admins.map((a) => a.email),
    requester_name: p.requesterName,
    requester_email: p.requesterEmail,
    company_name: p.companyName,
  });
}

export async function notifySignupDecision(p: { toEmail: string; toName: string; decision: "APPROVED" | "REJECTED" }) {
  await sendInternalEmail("signup-decision", { to_email: p.toEmail, to_name: p.toName, decision: p.decision });
}
