import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CandidateShell } from "@/components/candidate/shell";

// Candidate pages carry private links: never indexed, never leak a referrer.
export const metadata: Metadata = {
  title: { default: "Assessment", template: "%s | Talvyn" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function CandidateLayout({ children }: { children: ReactNode }) {
  return <CandidateShell>{children}</CandidateShell>;
}
