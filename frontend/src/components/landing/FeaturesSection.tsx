import type { HomeContent } from "@/lib/cms/content";

export function FeaturesSection({ content }: { content: HomeContent["features"] }) {
  return (
    <section id="features" className="mt-28">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        {/* Header */}
        <div className="text-center">
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#F2D74E] block">
            {content.eyebrow || "Platform"}
          </span>
          <h2 className="mt-3.5 text-[clamp(30px,4vw,44px)] font-[650] tracking-[-0.035em] max-w-[22ch] mx-auto text-balance text-white">
            {content.title || "Everything you'd build yourself, already running."}
          </h2>
          <p className="mt-4 text-[16px] text-[#8A8F98] max-w-[56ch] mx-auto">
            {content.body || "Every layer of the Talvyn platform is optimized for signal fidelity and audit-grade defensibility."}
          </p>
        </div>

        {/* 3 Columns Precision Grid */}
        <div className="mt-12 grid grid-cols-3 max-[860px]:grid-cols-1 gap-4">
          {/* Card 1: Monitor */}
          <div className="rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 flex flex-col">
            <div className="h-[132px] flex items-center justify-center relative overflow-hidden mb-6 w-full">
              <div className="flex items-center justify-center gap-1 h-full w-full">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => (
                  <div
                    key={i}
                    className={`w-2 h-14 rounded-[2px] opacity-75 transition-all ${
                      i === 9 ? "bg-[#FACC15]" : "bg-[#4ADE80]"
                    }`}
                    style={{
                      animation: "relayBarSweep 2.8s linear infinite",
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
            <span className="font-mono text-[12px] text-[#5A5F68] mb-2">01 Monitor</span>
            <h3 className="text-[18px] font-semibold text-white mb-2">
              Passive Telemetry & Real-Time Cadence
            </h3>
            <p className="text-[15px] leading-[1.55] text-[#8A8F98]">
              Inspect keystroke entropy, window blur events, and network latency across every candidate test session.
            </p>
          </div>

          {/* Card 2: Trace */}
          <div className="rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 flex flex-col">
            <div className="h-[132px] flex items-center justify-center relative overflow-hidden mb-6 w-full">
              <div className="flex flex-col justify-center gap-2.5 w-full max-w-[280px]">
                <div className="flex items-center gap-2 w-full">
                  <span className="font-mono text-[11px] text-[#8A8F98] w-[90px] shrink-0 text-left">jd.parse</span>
                  <div className="flex-1 h-1.5 relative bg-white/[0.03] rounded-full">
                    <div className="absolute top-0 h-1.5 rounded-full bg-[#181A1F] border border-white/[0.08] left-0 w-full" />
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <span className="font-mono text-[11px] text-[#8A8F98] w-[90px] shrink-0 text-left">pipeline.gen</span>
                  <div className="flex-1 h-1.5 relative bg-white/[0.03] rounded-full">
                    <div className="absolute top-0 h-1.5 rounded-full bg-[#181A1F] border border-white/[0.08] left-[2%] w-[12%]" />
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <span className="font-mono text-[11px] text-white w-[90px] shrink-0 text-left">rubric.grade</span>
                  <div className="flex-1 h-1.5 relative bg-white/[0.03] rounded-full">
                    <div className="absolute top-0 h-1.5 rounded-full bg-[#F2D74E] left-[16%] w-[58%]" />
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <span className="font-mono text-[11px] text-[#8A8F98] w-[90px] shrink-0 text-left">entropy.calc</span>
                  <div className="flex-1 h-1.5 relative bg-white/[0.03] rounded-full">
                    <div className="absolute top-0 h-1.5 rounded-full bg-[#181A1F] border border-white/[0.08] left-[76%] w-[6%]" />
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <span className="font-mono text-[11px] text-[#8A8F98] w-[90px] shrink-0 text-left">rank.emit</span>
                  <div className="flex-1 h-1.5 relative bg-white/[0.03] rounded-full">
                    <div className="absolute top-0 h-1.5 rounded-full bg-[#181A1F] border border-white/[0.08] left-[84%] w-[14%]" />
                  </div>
                </div>
              </div>
            </div>
            <span className="font-mono text-[12px] text-[#5A5F68] mb-2">02 Trace</span>
            <h3 className="text-[18px] font-semibold text-white mb-2">
              Execution Pipeline Tracing
            </h3>
            <p className="text-[15px] leading-[1.55] text-[#8A8F98]">
              Deep trace inspections across code compile times, database query contention, and unit test assertions.
            </p>
          </div>

          {/* Card 3: Alert */}
          <div className="rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 flex flex-col">
            <div className="h-[132px] flex items-center justify-center relative overflow-hidden mb-6 w-full">
              <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-3.5 w-full text-left">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-[26px] h-[26px] bg-[#F2D74E] text-[#1A1600] text-[13px] font-bold rounded-[5px] flex items-center justify-center shrink-0">
                    T
                  </div>
                  <span className="text-[13px] font-semibold text-white">Talvyn</span>
                  <span className="text-[12px] text-[#5A5F68]">#talent-alerts</span>
                </div>
                <p className="text-[13px] text-[#8A8F98] leading-[1.5]">
                  POST /v1/candidate/session clipboard paste threshold exceeded (14 events in 4s). Paging @lead-recruiter.
                </p>
              </div>
            </div>
            <span className="font-mono text-[12px] text-[#5A5F68] mb-2">03 Alert</span>
            <h3 className="text-[18px] font-semibold text-white mb-2">
              Instant Anomaly Dispatch
            </h3>
            <p className="text-[15px] leading-[1.55] text-[#8A8F98]">
              Route security breaches, candidate completions, and ranked shortlists directly to Slack, PagerDuty, or Webhooks.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
