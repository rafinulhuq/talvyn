import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

/** Candidate pages: no account, no navigation. Just the brand and the task. */
export function CandidateShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#candidate-main" className="sr-only rounded-control bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-6">
          <Logo height={20} />
        </div>
      </header>
      <main id="candidate-main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8 outline-none sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}

/** Centred message for terminal states (invalid link, ended, finished). */
export function CandidateMessage({ icon, tone = "neutral", title, children }: { icon: ReactNode; tone?: "neutral" | "success" | "danger" | "warning"; title: string; children?: ReactNode }) {
  const ring = { neutral: "border-line text-ink-muted", success: "border-success/30 bg-success-soft text-success", danger: "border-danger/30 bg-danger-soft text-danger", warning: "border-warning/30 bg-warning-soft text-warning" }[tone];
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-10 text-center">
      <span className={`grid size-12 place-items-center rounded-panel border bg-surface ${ring}`}>{icon}</span>
      <div>
        <h1 className="text-xl font-medium text-ink">{title}</h1>
      </div>
      {children}
    </div>
  );
}
