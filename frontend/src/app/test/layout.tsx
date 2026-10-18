/**
 * Candidate test layout.
 *
 * Intentionally minimal — no admin sidebar, no session context.
 * Candidates arrive via magic link with no account.
 *
 * Security: This layout has NO authentication.
 * Each page beneath it validates the magic link token server-side
 * via the FastAPI /validate endpoint before rendering any test content.
 */

import type { Metadata } from "next";
import { CandidateShellLayout } from "@/components/candidate/CandidateShellLayout";

export const metadata: Metadata = {
  title: {
    default: "Assessment",
    template: "%s | Assessment",
  },
  robots: { index: false, follow: false },
};

export default function CandidateTestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CandidateShellLayout>{children}</CandidateShellLayout>;
}
