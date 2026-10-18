"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Terminal, CheckCircle2, Code2, Briefcase, Cpu } from "lucide-react";
import { TiltBlock } from "@/components/ui/TiltBlock";
import type { HomeContent } from "@/lib/cms/content";

interface RoleDemoItem {
  id: string;
  tabLabel: string;
  badge: string;
  scenarioTitle: string;
  scenarioDesc: string;
  whyItWorks: string;
  candidateName: string;
  candidateScore: string;
  candidateAnalysis: string;
}

const roleDemos: RoleDemoItem[] = [
  {
    id: "backend",
    tabLabel: "[01: DISTRIBUTED_BACKEND_LEAD]",
    badge: "ROLE // DISTRIBUTED_SYSTEMS_ARCHITECT",
    scenarioTitle: "Scenario: 50,000 req/sec Spike & Database Lock Contention",
    scenarioDesc:
      "“A flash sale causes sudden 20x traffic spikes, triggering database row locks and 504 timeouts on checkout. Detail how you would implement asynchronous buffering, idempotency keys, and queue deduplication.”",
    whyItWorks:
      "Tests production concurrency instincts, data consistency guarantees, and distributed lock safety rather than memorized textbook algorithms.",
    candidateName: "Sarah Chen",
    candidateScore: "96.2% // STRONG_HIRE",
    candidateAnalysis:
      "“Candidate leveraged Redis stream consumer groups with PostgreSQL advisory locks and idempotency hash tokens. Zero GPT syntax patterns detected.”",
  },
  {
    id: "frontend",
    tabLabel: "[02: LEAD_FRONTEND_ENGINEER]",
    badge: "ROLE // SENIOR_FULLSTACK_ENGINEER",
    scenarioTitle: "Scenario: Next.js Hydration Mismatch & Micro-Frontend Drift",
    scenarioDesc:
      "“A legacy cookie state causes server-rendered HTML to diverge from client hydration in Next.js App Router. Diagnose the root cause and refactor to useSyncExternalStore or proxy middleware.”",
    whyItWorks:
      "Evaluates React 19 concurrent features, RSC boundaries, and memory leak mitigation under heavy client state.",
    candidateName: "Michael Thorne",
    candidateScore: "93.8% // HIRE",
    candidateAnalysis:
      "“Accurately isolated localStorage client read to pre-paint useSyncExternalStore subscription, eliminating flash of unstyled content.”",
  },
  {
    id: "ai_eng",
    tabLabel: "[03: LLM_APPLICATIONS_ENGINEER]",
    badge: "ROLE // AI_PLATFORM_ENGINEER",
    scenarioTitle: "Scenario: RAG Hallucination & High-Volume Token Cost Optimization",
    scenarioDesc:
      "“Vector search retrieval returns irrelevant context chunks, bloating prompt token costs by 400% and causing hallucinations. Formulate a hybrid BM25 + dense re-ranking pipeline.”",
    whyItWorks:
      "Exposes hands-on vector database latency, cross-encoder re-ranking, and prompt caching economics.",
    candidateName: "Alexandria Rivera",
    candidateScore: "95.5% // STRONG_HIRE",
    candidateAnalysis:
      "“Proposed reciprocal rank fusion (RRF) with bge-reranker-large and semantic caching. Complete cost simulation provided.”",
  },
];

export function AssessmentTypesSection({ content }: { content: HomeContent["assessmentTypes"] }) {
  const [activeTab, setActiveTab] = useState(0);
  const demo = roleDemos[activeTab] ?? roleDemos[0];

  return (
    <section id="assessment-types" className="border-b border-slate-300 bg-white py-24 font-sans text-slate-900 scroll-mt-20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {content.eyebrow || "Evaluation Specs & Role Matrices"}
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
            {content.title || "Engineered for High-Stakes Roles"}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-slate-600 font-normal dark:text-slate-300">
            {content.body || "Real-world engineering challenges that expose genuine intuition and filter out prompt-engineers."}
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mb-8">
          {roleDemos.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-150 ${
                activeTab === idx
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "border border-slate-300 bg-white text-slate-700 shadow-xs hover:border-slate-400 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-indigo-400"
              }`}
            >
              {item.tabLabel.replace(/\[\d+:\s*|_\]/g, " ").trim()}
            </button>
          ))}
        </div>

        {/* Interactive Scenario & Analysis Display Block */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (7 cols): Challenge Specification */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-300 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-5 text-xs text-slate-500 font-medium dark:text-slate-400">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{demo.badge}</span>
                <span className="text-slate-700 dark:text-slate-300 font-semibold">Production-Grade Difficulty</span>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-3 dark:text-white">
                {demo.scenarioTitle}
              </h3>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 text-xs sm:text-sm text-slate-800 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-slate-200 leading-relaxed italic my-4">
                {demo.scenarioDesc}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1 font-semibold dark:text-slate-400">
                  Evaluation Rationale
                </span>
                <p className="text-xs text-slate-600 leading-relaxed font-normal dark:text-slate-300">
                  {demo.whyItWorks}
                </p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500 font-medium dark:text-slate-400">Generated via Talvyn AI Taxonomy</span>
              <Link
                href="/dashboard/jds/upload"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all"
              >
                <span>Generate Test Like This</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Right Column (5 cols): AI Grading Matrix Telemetry */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-300 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-5 text-xs text-slate-500 font-medium dark:text-slate-400">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">Evaluation Scorecard</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Verified</span>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Candidate</span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{demo.candidateName}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Score</span>
                  <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{demo.candidateScore}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-slate-50/60 p-4 mb-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/40">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1 dark:text-slate-400">
                  Defensible AI Summary
                </span>
                <p className="text-xs text-slate-700 leading-relaxed font-normal dark:text-slate-300">
                  {demo.candidateAnalysis}
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Latency to Grade</span>
                  <span className="text-slate-900 font-semibold dark:text-white">1.8s</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Proctor Integrity</span>
                  <span className="text-emerald-600 font-semibold dark:text-emerald-400">100% (0 flags)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Recommendation</span>
                  <span className="text-indigo-600 font-semibold dark:text-indigo-400">Strong Hire</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[11px] text-slate-400 font-medium">All scores backed by explainable criteria</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
