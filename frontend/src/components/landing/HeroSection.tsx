import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Interactive3DCockpit } from "@/components/landing/Interactive3DCockpit";
import type { HomeContent } from "@/lib/cms/content";

export function HeroSection({ content }: { content: HomeContent["hero"] }) {
  return (
    <section className="relative text-center pt-24 pb-20 max-[760px]:pt-18 flex flex-col items-center">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8 w-full flex flex-col items-center">
        {/* Announcement Pill */}
        <Link
          href="#how-it-works"
          className="inline-flex items-center text-[13px] text-[#8A8F98] py-[5px] pr-[12px] pl-[5px] rounded-full border border-white/10 bg-white/[0.03] hover:border-white/20 transition-colors"
        >
          <span className="bg-[#F2D74E] text-[#1A1600] text-[11px] font-bold uppercase tracking-[0.06em] py-[3px] px-[8px] rounded-full mr-[10px] leading-tight">
            Live
          </span>
          <span>AI Evaluation Engine · Passive Telemetry Active</span>
          <span className="text-[#8A8F98] ml-[6px]">→</span>
        </Link>

        {/* Headline */}
        <h1 className="mt-7 text-[clamp(40px,6.4vw,80px)] font-[650] leading-[1.02] tracking-[-0.045em] max-w-[16ch] mx-auto text-balance text-white">
          {content.titlePrefix || "Audit-grade technical screening"}
          <span className="block mt-1 text-white">
            {content.titleHighlight || "before the first interview."}
          </span>
        </h1>

        {/* Subhead */}
        <p className="mt-6 text-[18px] max-[600px]:text-[16px] leading-[1.6] text-[#8A8F98] max-w-[56ch] mx-auto">
          {content.body ||
            "Upload any job description. Talvyn automatically generates job-tailored evaluation pipelines, neutralizes AI copycats via passive telemetry, and renders ranked shortlists with audit-grade defensibility."}
        </p>

        {/* Actions */}
        <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={content.primaryCta.href || "/dashboard/jds/upload"}
            className="rounded-[10px] bg-[#F2D74E] px-5 py-3 text-[15px] font-semibold text-[#1A1600] hover:bg-[#F7E27A] transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3"
          >
            {content.primaryCta.label || "Upload Job Description"}
          </Link>
          <div className="font-mono text-[14px] py-3 px-4 rounded-[10px] bg-[#121317] border border-white/[0.08] text-white inline-flex items-center select-all">
            <span className="text-[#5A5F68] mr-1.5">$</span>npx talvyn evaluate --live
          </div>
        </div>

        {/* Fine print */}
        <p className="mt-4 text-[13px] text-[#5A5F68]">
          Free for 10 candidate evaluations. No credit card required.
        </p>

        {/* Product Cockpit Window (64px below) */}
        <div className="mt-16 relative w-full max-w-[1080px] mx-auto">
          {/* Top glow */}
          <div
            className="pointer-events-none absolute left-[10%] right-[10%] -top-[200px] h-[400px] z-0"
            style={{
              background: "radial-gradient(closest-side, rgba(242, 215, 78, 0.16), transparent)",
            }}
          />

          <div className="relative z-10">
            <Interactive3DCockpit />
          </div>
        </div>
      </div>
    </section>
  );
}
