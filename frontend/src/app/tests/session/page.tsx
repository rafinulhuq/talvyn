/**
 * Candidate test entry page — /tests/session (tokenless, A8-4).
 *
 * The magic-link token was redeemed into an httpOnly cookie by middleware
 * when the candidate opened their emailed /test(s)/<token> link; this page
 * reads it server-side, validates it against FastAPI, and renders the
 * invitation landing. The token never appears in the URL or client JS.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ATTEMPT_TOKEN_COOKIE } from "@/lib/candidateSession";
import { TestInvitationLanding } from "@/components/candidate/TestInvitationLanding";

export const metadata: Metadata = {
  title: "Assessment Invitation",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function TestSessionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ATTEMPT_TOKEN_COOKIE)?.value ?? null;
  return <TestInvitationLanding token={token} />;
}
