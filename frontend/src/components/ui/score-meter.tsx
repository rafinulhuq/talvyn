import { cn } from "@/lib/cn";

/**
 * The product's signature element: a measurement scale for every score.
 * Ticks every 10%, a cobalt fill, and a notch at the passing mark — it reads
 * like an instrument, not a progress bar. Value and pass mark are 0–100.
 */
export function ScoreMeter({
  value,
  passMark,
  label,
  size = "md",
  className,
}: {
  value: number;
  passMark?: number;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const passed = passMark === undefined ? undefined : v >= passMark;
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className="flex items-baseline gap-1.5">
          <span className={cn("font-medium text-ink", size === "md" ? "text-lg" : "text-base")}>{Math.round(v)}</span>
          <span className="text-sm text-ink-muted">/ 100</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
        aria-valuetext={
          passMark === undefined ? `${Math.round(v)} of 100` : `${Math.round(v)} of 100, pass mark ${passMark}, ${passed ? "passed" : "below pass mark"}`
        }
        className={cn("relative", size === "md" ? "h-3" : "h-2")}
      >
        <div className="absolute inset-x-0 top-0 h-full rounded-[2px] bg-sunken" />
        <div
          className={cn("absolute left-0 top-0 h-full rounded-[2px]", passed === false ? "bg-ink-faint" : "bg-accent")}
          style={{ width: `${v}%` }}
        />
        {ticks.map((t) => (
          <span
            key={t}
            aria-hidden
            className={cn("absolute top-full w-px bg-line-strong", t % 50 === 0 ? "h-1.5" : "h-1")}
            style={{ left: `calc(${t}% - ${t === 100 ? 1 : 0}px)` }}
          />
        ))}
        {passMark !== undefined && (
          <span
            aria-hidden
            className="absolute -top-1 h-[calc(100%+0.5rem)] w-0.5 rounded-full bg-ink"
            style={{ left: `calc(${passMark}% - 1px)` }}
          />
        )}
      </div>
      {passMark !== undefined && (
        <span className="pt-1.5 text-xs text-ink-muted">
          <span className={passed ? "font-medium text-success" : "font-medium text-ink"}>{passed ? "Passed" : "Below pass mark"}</span>
          <span className="ml-1.5">Pass mark {passMark}</span>
        </span>
      )}
    </div>
  );
}
