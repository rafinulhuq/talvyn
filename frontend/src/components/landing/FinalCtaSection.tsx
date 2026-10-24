import Link from "next/link";
import type { HomeContent } from "@/lib/cms/content";

export function FinalCtaSection({ content }: { content: HomeContent["finalCta"] }) {
  return (
    <section className="mt-28">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        <div
          className="rounded-[20px] border border-white/[0.08] p-8 sm:p-16 text-center relative overflow-hidden"
          style={{
            background: "radial-gradient(60% 80% at 50% 0%, rgba(242, 215, 78, 0.12), transparent 70%), #121317",
          }}
        >
          <div className="relative z-10">
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#F2D74E] block mb-3">
              {content.eyebrow || "Deploy Assessment Pipeline"}
            </span>

            <h2 className="text-[clamp(32px,4.4vw,48px)] font-[650] tracking-[-0.035em] text-white max-w-[20ch] mx-auto text-balance">
              {content.title || "Ship with a safety net."}
            </h2>

            <p className="mx-auto mt-4 max-w-[56ch] text-[17px] text-[#8A8F98] leading-relaxed">
              {content.body ||
                "Upload your job description now. Evaluate your first 10 candidate cohorts with zero credit card or infrastructure setup."}
            </p>

            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link
                href={content.primaryCta.href || "/dashboard/jds/upload"}
                className="rounded-[10px] bg-[#F2D74E] px-5 py-3 text-[15px] font-semibold text-[#1A1600] hover:bg-[#F7E27A] transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3"
              >
                {content.primaryCta.label || "Upload Job Description"}
              </Link>
              <Link
                href={content.secondaryCta.href || "/login"}
                className="rounded-[10px] border border-white/12 bg-transparent px-5 py-3 text-[15px] font-semibold text-white hover:border-white/24 transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3"
              >
                {content.secondaryCta.label || "Access Console"}
              </Link>
            </div>

            <div className="mt-10 pt-6 border-t border-white/[0.06] flex flex-wrap items-center justify-center gap-6 text-xs text-[#5A5F68] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
                Zero credit card required
              </span>
              <span>·</span>
              <span>End-to-end encrypted</span>
              <span>·</span>
              <span>SOC-2 Type II aligned</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
