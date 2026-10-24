import { Check, X } from "lucide-react";
import type { HomeContent } from "@/lib/cms/content";

export function ComparisonSection({ content }: { content: HomeContent["comparison"] }) {
  return (
    <section id="comparison" className="mt-28">
      <div className="mx-auto max-w-[1080px] px-5 sm:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#F2D74E] block">
            {content.eyebrow || "Technical Comparison & Paradigm Shift"}
          </span>
          <h2 className="mt-3.5 text-[clamp(30px,4vw,44px)] font-[650] tracking-[-0.035em] max-w-[20ch] mx-auto text-balance text-white">
            {content.title || "The Paradigm Shift"}
          </h2>
        </div>

        {/* Matrix Block */}
        <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#121317]">
          {/* Header Row */}
          <div className="grid grid-cols-3 border-b border-white/[0.08] bg-[#181A1F] text-xs font-mono text-[#8A8F98]">
            <div className="p-4 sm:p-5 uppercase tracking-wider">
              Evaluation Vector
            </div>
            <div className="border-x border-white/[0.08] p-4 sm:p-5 text-center uppercase tracking-wider">
              {content.oldLabel || "Legacy Interviewing"}
            </div>
            <div className="p-4 sm:p-5 text-center text-[#F2D74E] font-semibold uppercase tracking-wider bg-[#F2D74E]/[0.05]">
              {content.newLabel || "Talvyn Platform"}
            </div>
          </div>

          {/* Matrix Rows */}
          {content.rows.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 border-b border-white/[0.06] text-xs transition-colors hover:bg-white/[0.02] ${
                i % 2 === 0 ? "bg-[#121317]" : "bg-[#181A1F]/50"
              }`}
            >
              <div className="p-4 sm:p-5 font-semibold text-white border-r border-white/[0.08]">
                {row.label}
              </div>
              <div className="flex items-center justify-center border-r border-white/[0.08] p-4 sm:p-5 text-center text-[#8A8F98]">
                <span className="flex items-center gap-2">
                  <X className="h-3.5 w-3.5 text-[#F87171] shrink-0" />
                  {row.old}
                </span>
              </div>
              <div className="flex items-center justify-center p-4 sm:p-5 text-center text-white font-semibold bg-[#F2D74E]/[0.03]">
                <span className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4ADE80] shrink-0" />
                  {row.now}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
