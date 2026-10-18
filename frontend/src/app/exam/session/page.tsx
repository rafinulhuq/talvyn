/**
 * Sectioned exam entry page — /exam/session (tokenless, A8-4).
 *
 * Same httpOnly-cookie mechanics as /tests/session: middleware redeemed
 * the emailed /exam/<token> link into the cookie and redirected here.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ATTEMPT_TOKEN_COOKIE } from "@/lib/candidateSession";
import { SectionedExamInvitationLanding } from "@/components/candidate/SectionedExamInvitationLanding";

export const metadata: Metadata = {
  title: "Assessment Invitation",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ExamSessionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ATTEMPT_TOKEN_COOKIE)?.value ?? null;
  return <SectionedExamInvitationLanding token={token} />;
}
