/**
 * Horizontal candidate funnel: Invited -> Started -> In Progress -> Submitted
 * -> Reviewed, then split into Recommended / Rejected outcomes.
 * Server-renderable — receives already-fetched stage counts as props.
 */

import { ChevronRight, ThumbsUp, ThumbsDown } from "lucide-react";
import { clsx } from "clsx";

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
}

interface CandidatePipelineProps {
  stages: PipelineStage[];
}

function pct(count: number, of: number): string {
  if (of <= 0) return "0%";
  return `${Math.round((count / of) * 100)}%`;
}

export function CandidatePipeline({ stages }: CandidatePipelineProps) {
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
  const funnel = ["invited", "started", "in_progress", "submitted", "reviewed"]
    .map((key) => byKey[key])
    .filter(Boolean);
  const invited = byKey.invited?.count ?? 0;
  const recommended = byKey.recommended;
  const rejected = byKey.rejected;

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-2 pt-1">
      {funnel.map((stage, i) => {
        const isSubmitted = stage.key === "submitted";
        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={clsx(
                "flex min-w-[130px] flex-col gap-1.5 rounded-xl p-3.5 transition-colors duration-150",
                "border border-white/8 bg-[#121317] text-white shadow-xs",
                "hover:border-white/15",
                isSubmitted && "ring-1 ring-[#F2D74E]/40 border-[#F2D74E]/40 bg-[#181A1F]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xl font-bold text-white tabular-nums">
                  {stage.count}
                </span>
                <span className="text-[10px] font-medium text-white/80">
                  {pct(stage.count, invited)}
                </span>
              </div>
              <span className="text-xs font-medium text-white">
                {stage.label}
              </span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#181A1F] border border-white/5">
                <div
                  className="h-full rounded-full bg-[#F2D74E] transition-[width] duration-300"
                  style={{ width: pct(stage.count, invited) }}
                />
              </div>
            </div>
            {i < funnel.length - 1 && (
              <ChevronRight className="mx-1.5 h-4 w-4 shrink-0 text-white/70" />
            )}
          </div>
        );
      })}

      {(recommended || rejected) && (
        <>
          <ChevronRight className="mx-1.5 h-4 w-4 shrink-0 text-white/70" />
          <div className="flex gap-2">
            {recommended && (
              <div className="flex min-w-[130px] flex-col gap-1 rounded-xl border border-[#4ADE80]/30 bg-[#4ADE80]/10 p-3.5 text-[#4ADE80] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-display text-xl font-bold tabular-nums text-[#4ADE80]">
                    <ThumbsUp className="h-4 w-4" />
                    {recommended.count}
                  </span>
                  <span className="rounded-full bg-[#4ADE80]/20 border border-[#4ADE80]/30 px-1.5 py-0.2 text-[9px] font-semibold text-[#4ADE80]">
                    Fit
                  </span>
                </div>
                <span className="text-xs font-semibold text-white">
                  Recommended
                </span>
                <span className="text-[10px] text-[#4ADE80]/80">Passed benchmark</span>
              </div>
            )}
            {rejected && (
              <div className="flex min-w-[130px] flex-col gap-1 rounded-xl border border-[#F87171]/30 bg-[#F87171]/10 p-3.5 text-[#F87171] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-display text-xl font-bold tabular-nums text-[#F87171]">
                    <ThumbsDown className="h-4 w-4" />
                    {rejected.count}
                  </span>
                  <span className="rounded-full bg-[#F87171]/20 border border-[#F87171]/30 px-1.5 py-0.2 text-[9px] font-semibold text-[#F87171]">
                    Low
                  </span>
                </div>
                <span className="text-xs font-semibold text-white">
                  Rejected
                </span>
                <span className="text-[10px] text-[#F87171]/80">Below threshold</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

