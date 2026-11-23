import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ScoreMeter } from "@/components/ui/score-meter";

/** Sign-in family: the form on the left; on wide screens, a real report excerpt on the right. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="self-start rounded-control" aria-label="Talvyn home">
          <Logo height={22} />
        </Link>
        <main className="flex flex-1 items-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
          <span>© {new Date().getFullYear()} Talvyn</span>
          <Link href="/blog" className="hover:text-ink">
            Blog
          </Link>
        </footer>
      </div>

      <aside aria-label="Example evaluation report" className="relative hidden overflow-hidden border-l border-line bg-sunken lg:flex lg:items-center lg:justify-center">
        <div className="w-full max-w-md px-10">
          <p className="max-w-sm font-serif text-3xl leading-[1.1] text-ink">Every score links back to the answer that earned it.</p>
          <div className="mt-10 rounded-panel border border-line bg-surface p-6 shadow-float">
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="text-md font-medium text-ink">Amara Okafor</p>
                <p className="text-sm text-ink-muted">Senior Backend Engineer, submitted 18 Nov</p>
              </div>
            </div>
            <div className="flex flex-col gap-5 pt-5">
              <ScoreMeter label="Overall" value={86} passMark={70} />
              <div className="flex flex-col gap-4 border-t border-line pt-5">
                <ScoreMeter size="sm" label="Technical" value={91} />
                <ScoreMeter size="sm" label="Reasoning" value={82} />
                <ScoreMeter size="sm" label="Problem solving" value={84} />
              </div>
              <figure className="border-t border-line pt-4">
                <figcaption className="text-sm text-ink-muted">Grader note on question 7</figcaption>
                <blockquote className="mt-1 text-base text-ink">
                  Explains why idempotency keys are needed for at-least-once delivery and proposes a retry policy with jittered
                  backoff. Doesn&apos;t cover key expiry.
                </blockquote>
              </figure>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
