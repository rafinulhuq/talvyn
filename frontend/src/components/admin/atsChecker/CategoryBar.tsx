import { clsx } from "clsx";

export function CategoryBar({
  label,
  score,
  max,
  summary,
}: {
  label: string;
  score: number;
  max: number;
  summary: string;
}) {
  // A category with max_score 0 did not apply to this run (no JD selected).
  // Showing it as an empty bar would read as a zero score, so it gets an
  // explicit "not checked" treatment instead.
  const skipped = max === 0;
  const ratio = skipped ? 0 : score / max;
  const barColor =
    ratio >= 0.85 ? "bg-success" : ratio >= 0.6 ? "bg-warning" : "bg-danger";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {label}
        </span>
        <span
          className={clsx(
            "text-xs tabular-nums",
            skipped ? "text-slate-400" : "font-semibold text-slate-600 dark:text-slate-300"
          )}
        >
          {skipped ? "not checked" : `${Math.round(score)} / ${max}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {!skipped && (
          <div
            className={clsx("h-full rounded-full transition-all", barColor)}
            style={{ width: `${Math.max(ratio * 100, 2)}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary}</p>
    </div>
  );
}
