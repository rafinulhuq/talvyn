import { CircleAlert, CircleCheck, ShieldX, TimerOff } from "lucide-react";
import type { ReactNode } from "react";
import type { CopyPair } from "@/lib/cms/candidate-copy";
import { CandidateMessage } from "./shell";

export function InvalidLink({ reason, copy }: { reason: string; copy: CopyPair }) {
  const icon =
    reason === "expired" ? <TimerOff aria-hidden className="size-5" /> : reason === "already_used" ? <CircleCheck aria-hidden className="size-5" /> : reason === "revoked" || reason === "terminated" ? <ShieldX aria-hidden className="size-5" /> : <CircleAlert aria-hidden className="size-5" />;
  return (
    <CandidateMessage icon={icon} tone={reason === "already_used" ? "success" : reason === "terminated" ? "danger" : "neutral"} title={copy.heading}>
      <p className="max-w-md text-md text-ink-muted">{copy.body}</p>
    </CandidateMessage>
  );
}

/** The two-column landing: what this is on the left, rules and the start action on the right. */
export function LandingLayout({ eyebrow, title, intro, details, rulesTitle, rules, action }: { eyebrow: string; title: string; intro: ReactNode; details: ReactNode; rulesTitle: string; rules: string[]; action: ReactNode }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="flex flex-col gap-6">
        <div>
          <p className="text-base text-ink-muted">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-medium tracking-[-0.015em] text-ink">{title}</h1>
          <div className="mt-3 max-w-[62ch] text-md text-ink-muted">{intro}</div>
        </div>
        {details}
      </section>
      <aside className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5 lg:sticky lg:top-6">
        <div>
          <h2 className="text-base font-medium text-ink">{rulesTitle}</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {rules.map((r) => (
              <li key={r} className="flex gap-2.5 text-base text-ink-muted">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-faint" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        {action}
      </aside>
    </div>
  );
}
