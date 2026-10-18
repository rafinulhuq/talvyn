import { Loader2, Square } from "lucide-react";
import type { ProgressState } from "@/hooks/useGenerateTestsFlow";

interface Props {
  message: string;
  progress: ProgressState | null;
  cancelling: boolean;
  onCancel: () => void;
}

export function GenerationProgressBanner({ message, progress, cancelling, onCancel }: Props) {
  const pct = progress?.pct ?? 0;
  const stepLabel = progress?.step || message;
  const detail = progress?.detail ?? "Generating 3 tests · may take 2–6 minutes";

  return (
    // w-full: this card lives in the page header's action slot, which is
    // full width on a phone. Sized to its content it used to push the Stop
    // button past the right edge of the viewport.
    <div className="w-full rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3.5">
      {/* Header row — label and percentage on one line, Stop on its own
          row on a phone so nothing has to be truncated to a stub. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-700" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-brand-900">{stepLabel}</p>
          {pct > 0 && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-brand-700 sm:hidden">
              {pct}%
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pct > 0 && (
            <span className="hidden text-xs font-semibold tabular-nums text-brand-700 sm:inline">
              {pct}%
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-danger disabled:opacity-50 sm:min-h-0 sm:w-auto sm:py-1"
            aria-label="Stop generation"
          >
            {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            Stop
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Detail / sub-label */}
      <p className="mt-1.5 text-xs text-brand-700">{detail}</p>
    </div>
  );
}
