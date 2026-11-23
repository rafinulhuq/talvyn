import { TimerOff } from "lucide-react";
import type { Metadata } from "next";
import { CandidateMessage } from "@/components/candidate/shell";
import { candidateCopy } from "@/server/candidate";

export const metadata: Metadata = { title: "Link expired" };

export default async function ExpiredPage() {
  const c = (await candidateCopy()).expiredPage;
  return (
    <CandidateMessage icon={<TimerOff aria-hidden className="size-5" />} tone="warning" title={c.heading}>
      <p className="max-w-md text-md text-ink-muted">{c.body}</p>
      <div className="w-full max-w-md rounded-panel border border-line bg-surface p-5 text-left">
        <h2 className="text-base font-medium text-ink">{c.nextTitle}</h2>
        <p className="mt-2 text-base text-ink-muted">{c.nextBody}</p>
      </div>
    </CandidateMessage>
  );
}
