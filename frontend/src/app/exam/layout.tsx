/**
 * Sectioned exam candidate layout (Master Prompt 2/3 question-bank flow).
 *
 * Mirrors app/test/layout.tsx exactly — intentionally minimal, no admin
 * sidebar, no session context. Candidates arrive via the SAME magic-link
 * token mechanism as the legacy /test/[token] flow, just routed here
 * instead when the JD's approved tests are bank-mode (see
 * invitation_service.py's build_magic_link path_prefix selection).
 *
 * Security: no authentication here either — each page validates the magic
 * link token server-side (via the same FastAPI /invitations/validate
 * endpoint the legacy flow uses) before rendering any exam content.
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

export default function CandidateExamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CandidateShellLayout>{children}</CandidateShellLayout>;
}
