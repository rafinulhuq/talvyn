/**
 * Best-effort email notifications for the signup / access-request flow.
 * Wraps the backend's internal-token-guarded /internal/emails/* endpoints
 * (see backend/app/api/v1/internal_emails.py) via the shared serverFetch
 * helper. Callers should never let a failure here block the signup or
 * approval/rejection response — catch and log instead.
 */

import { serverFetch } from "@/lib/api/serverFetch";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

interface EmailDispatchResponse {
  sent: number;
  failed: number;
}

export async function notifySuperAdminsOfSignupRequest(params: {
  requesterName: string;
  requesterEmail: string;
  companyName: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN, isActive: true },
    select: { email: true },
  });
  if (admins.length === 0) return;

  await serverFetch<EmailDispatchResponse>("/api/v1/internal/emails/signup-request", {
    method: "POST",
    body: JSON.stringify({
      admin_emails: admins.map((admin) => admin.email),
      requester_name: params.requesterName,
      requester_email: params.requesterEmail,
      company_name: params.companyName,
    }),
  });
}

export async function notifySignupDecision(params: {
  toEmail: string;
  toName: string;
  decision: "APPROVED" | "REJECTED";
}): Promise<void> {
  await serverFetch<EmailDispatchResponse>("/api/v1/internal/emails/signup-decision", {
    method: "POST",
    body: JSON.stringify({
      to_email: params.toEmail,
      to_name: params.toName,
      decision: params.decision,
    }),
  });
}
