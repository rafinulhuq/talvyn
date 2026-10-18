import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import type { HomeContent } from "@/lib/cms/content";

export function FinalCtaSection({ content }: { content: HomeContent["finalCta"] }) {
  return (
    <section className="relative overflow-hidden bg-slate-50 py-24 text-slate-900 border-t border-slate-300">
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        
        {/* Monolithic Command Center Box */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-300 bg-white p-8 sm:p-14 text-center shadow-xl shadow-slate-200/60 ring-1 ring-slate-900/5">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/40 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-50/90 px-4 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">
              <Terminal className="h-3.5 w-3.5 text-indigo-600" />
              <span>{content.eyebrow || "Deploy Assessment Pipeline"}</span>
            </div>

            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              {content.title || "Begin Automated Candidate Screening"}
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-slate-600 font-sans leading-relaxed">
              {content.body ||
                "Upload your job description now. Evaluate your first 10 candidate cohorts with zero obligation or infrastructure setup."}
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href={content.primaryCta.href || "/dashboard/jds/upload"}
                className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 active:scale-[0.99] transition-all sm:w-auto"
              >
                <span>{content.primaryCta.label || "Upload Job Description"}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href={content.secondaryCta.href || "/login"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99] transition-all sm:w-auto"
              >
                <span>{content.secondaryCta.label || "Access Command Center"}</span>
              </Link>
            </div>

            <div className="mt-10 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
