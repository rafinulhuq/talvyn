import { Badge } from "@/components/ui/badge";
import { ScoreMeter } from "@/components/ui/score-meter";

/**
 * The hero's visual: a candidate report drawn with the product's own
 * components. The data is illustrative and labelled as an example, so it
 * never reads as a customer result.
 */
export function ExampleReport() {
  return (
    <figure aria-label="Example candidate report" className="rounded-panel border border-line bg-surface shadow-float">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-ink">Priya Raman</p>
          <p className="truncate text-sm text-ink-muted">Senior Backend Engineer, technical test</p>
        </div>
        <Badge tone="success" className="h-6 px-2 text-sm">
          Hire
        </Badge>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">
        <ScoreMeter value={74} passMark={65} label="Overall, 37 of 50 marks" />
        <div className="grid grid-cols-2 gap-4">
          <ScoreMeter size="sm" value={83} label="PostgreSQL" />
          <ScoreMeter size="sm" value={70} label="API design" />
          <ScoreMeter size="sm" value={80} label="Concurrency" />
          <ScoreMeter size="sm" value={60} label="Observability" />
        </div>
        <div className="rounded-control bg-sunken p-3">
          <p className="text-sm font-medium text-ink">Written answer, question 7</p>
          <p className="mt-1 text-sm text-ink-muted">Covered: idempotency keys, retry with backoff. Missed: dead-letter handling.</p>
        </div>
      </div>
      <figcaption className="border-t border-line px-5 py-2.5 text-xs text-ink-muted">Example report. Names and scores are illustrative.</figcaption>
    </figure>
  );
}
