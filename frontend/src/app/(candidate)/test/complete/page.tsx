import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { CandidateMessage } from "@/components/candidate/shell";
import { candidateCopy } from "@/server/candidate";

export const metadata: Metadata = { title: "Assessment submitted" };

export default async function CompletePage() {
  const c = (await candidateCopy()).completion;
  return (
    <CandidateMessage icon={<CircleCheck aria-hidden className="size-5" />} tone="success" title={c.heading}>
      <p className="max-w-md text-md text-ink-muted">{c.body}</p>
      <div className="w-full max-w-md rounded-panel border border-line bg-surface p-5 text-left">
        <h2 className="text-base font-medium text-ink">{c.nextTitle}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {c.nextItems.map((i) => (
            <li key={i} className="flex gap-2.5 text-base text-ink-muted">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-faint" />
              {i}
            </li>
          ))}
        </ul>
      </div>
    </CandidateMessage>
  );
}
