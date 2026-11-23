import type { PipelineStage } from "@/types/stats";

const nf = new Intl.NumberFormat("en");
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Candidate funnel as a measurement: each stage's bar is scaled to the first
 * stage, with the step conversion beside it. Single hue: this is magnitude.
 */
export function Pipeline({ stages }: { stages: PipelineStage[] }) {
  const top = Math.max(1, stages[0]?.count ?? 0);
  return (
    <ol className="flex flex-col gap-3.5">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]?.count ?? 0 : 0;
        const conv = i > 0 && prev > 0 ? s.count / prev : null;
        return (
          <li key={s.key} className="grid grid-cols-[minmax(7rem,9rem)_1fr_3.5rem] items-center gap-3">
            <span className="truncate text-base text-ink">{s.label}</span>
            <span className="relative h-2 rounded-[2px] bg-sunken" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-[2px] bg-chart-1" style={{ width: `${(s.count / top) * 100}%` }} />
            </span>
            <span className="text-right">
              <span className="block text-base font-medium text-ink">{nf.format(s.count)}</span>
              {conv !== null && <span className="block text-xs text-ink-muted">{pct(conv)} of prev.</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
