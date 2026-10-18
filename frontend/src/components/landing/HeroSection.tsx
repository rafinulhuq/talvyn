import Link from "next/link";
import { ArrowRight, Terminal, Shield, Zap, Sparkles, Check, ChevronRight } from "lucide-react";
import { GeometricCanvas3D } from "@/components/landing/GeometricCanvas3D";
import { Interactive3DCockpit } from "@/components/landing/Interactive3DCockpit";
import type { HomeContent } from "@/lib/cms/content";

export function HeroSection({ content }: { content: HomeContent["hero"] }) {
  return (
    <section className="relative overflow-hidden bg-slate-50 text-slate-900 pt-16 pb-24 lg:pt-24 lg:pb-36 border-b border-slate-300 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800">
      {/* 3D Geometric Interactive Wireframe Canvas */}
      <GeometricCanvas3D />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Technical Eyebrow Pill */}
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-50/90 px-4 py-1.5 text-xs font-semibold tracking-wide text-indigo-700 shadow-xs dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse dark:bg-indigo-400" />
            <Terminal className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>AI Evaluation Engine &bull; Candidate Screening</span>
          </div>
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-5xl text-center font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08] dark:text-white">
          <span className="block">
            {content.titlePrefix || "Precision Assessment"}
          </span>
          <span className="block mt-2 text-indigo-600 dark:text-indigo-400">
            {content.titleHighlight || "Powered by Machine Intelligence"}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm sm:text-base text-slate-600 leading-relaxed font-normal dark:text-slate-300">
          {content.body ||
            "Upload any job description. Talvyn automatically generates job-tailored evaluation pipelines, neutralizes AI copycats via passive telemetry, and renders ranked shortlists with audit-grade defensibility."}
        </p>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href={content.primaryCta.href || "/dashboard/jds/upload"}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-8 py-4 text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:bg-indigo-700 active:scale-[0.98] transition-all sm:w-auto"
          >
            <span>{content.primaryCta.label || "Upload Job Description"}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a
            href="#how-it-works"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300/90 bg-white px-8 py-4 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-xs hover:border-slate-400 hover:bg-slate-50 hover:text-indigo-600 active:scale-[0.98] transition-all sm:w-auto dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
          >
            <span>Explore Architecture</span>
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        {/* Specification Badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-xs text-slate-600 font-medium dark:text-slate-400">
          <span className="flex items-center gap-2 border-l border-slate-300 pl-3 dark:border-slate-700">
            <Check className="h-3.5 w-3.5 text-emerald-500" /> Zero Setup Required
          </span>
          <span className="flex items-center gap-2 border-l border-slate-300 pl-3 dark:border-slate-700">
            <Shield className="h-3.5 w-3.5 text-indigo-500" /> Passive Cadence Telemetry
          </span>
          <span className="flex items-center gap-2 border-l border-slate-300 pl-3 dark:border-slate-700">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Real-Time Evaluation
          </span>
        </div>

        {/* 3D Holographic Cockpit */}
        <div className="relative mx-auto mt-14 max-w-5xl">
          <Interactive3DCockpit />
        </div>
      </div>
    </section>
  );
}
