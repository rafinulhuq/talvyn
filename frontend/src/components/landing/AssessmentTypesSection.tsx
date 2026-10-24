"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
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
    tabLabel: "Distributed Backend Lead",
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
    tabLabel: "Lead Frontend Engineer",
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
    tabLabel: "LLM Applications Engineer",
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
    <section id="assessment-types" className="mt-28">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        {/* Header */}
        <div className="text-center">
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#F2D74E] block">
            {content.eyebrow || "Evaluation Specs & Role Matrices"}
          </span>
          <h2 className="mt-3.5 text-[clamp(30px,4vw,44px)] font-[650] tracking-[-0.035em] max-w-[20ch] mx-auto text-balance text-white">
            {content.title || "Engineered for High-Stakes Roles"}
          </h2>
          <p className="mt-4 text-[16px] text-[#8A8F98] max-w-[56ch] mx-auto">
            {content.body || "Real-world engineering challenges that expose genuine intuition and filter out prompt-engineers."}
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-10 mb-8">
          {roleDemos.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`rounded-[10px] px-4 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === idx
                  ? "bg-[#F2D74E] text-[#1A1600]"
                  : "border border-white/12 bg-transparent text-[#8A8F98] hover:text-white hover:border-white/24"
              }`}
            >
              {item.tabLabel}
            </button>
          ))}
        </div>

        {/* Display Blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column (7 cols): Challenge Spec */}
          <div className="lg:col-span-7 rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-5 text-xs font-mono">
                <span className="font-semibold text-[#F2D74E]">{demo.badge}</span>
                <span className="text-[#8A8F98]">Production Difficulty</span>
              </div>

              <h3 className="text-[17px] font-semibold text-white mb-3">
                {demo.scenarioTitle}
              </h3>
              <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-4 text-[13px] text-white leading-relaxed italic my-4 font-mono">
                {demo.scenarioDesc}
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06]">
                <span className="text-[11px] text-[#5A5F68] uppercase tracking-[0.08em] block mb-1 font-mono">
                  Evaluation Rationale
                </span>
                <p className="text-[13px] text-[#8A8F98] leading-relaxed">
                  {demo.whyItWorks}
                </p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12px] text-[#5A5F68] font-mono">Generated via Talvyn Engine</span>
              <Link
                href="/dashboard/jds/upload"
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#F2D74E] px-4 py-2 text-xs font-semibold text-[#1A1600] hover:bg-[#F7E27A] transition-colors"
              >
                <span>Generate Assessment</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Right Column (5 cols): AI Scorecard */}
          <div className="lg:col-span-5 rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-5 text-xs font-mono">
                <span className="font-semibold text-white">Evaluation Scorecard</span>
                <span className="text-[#4ADE80] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 inline" /> Verified
                </span>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[11px] text-[#5A5F68] uppercase tracking-[0.08em] font-mono">Candidate</span>
                  <p className="text-[15px] font-semibold text-white">{demo.candidateName}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-[#5A5F68] uppercase tracking-[0.08em] font-mono">Fit Index</span>
                  <p className="text-[15px] font-mono font-bold text-[#F2D74E]">{demo.candidateScore.split("//")[0]}</p>
                </div>
              </div>

              <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-4 mb-4">
                <span className="text-[11px] text-[#5A5F68] uppercase tracking-[0.08em] block mb-1 font-mono">
                  Defensible Audit Summary
                </span>
                <p className="text-[13px] text-[#8A8F98] leading-relaxed">
                  {demo.candidateAnalysis}
                </p>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-white/[0.06] py-1.5">
                  <span className="text-[#8A8F98]">Latency to Grade</span>
                  <span className="text-white font-semibold">1.8s</span>
                </div>
                <div className="flex justify-between border-b border-white/[0.06] py-1.5">
                  <span className="text-[#8A8F98]">Proctor Integrity</span>
                  <span className="text-[#4ADE80] font-semibold">100% (0 flags)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#8A8F98]">Verdict</span>
                  <span className="text-[#F2D74E] font-semibold">Strong Hire</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.08] text-center font-mono">
              <span className="text-[11px] text-[#5A5F68]">100% explainable rubric telemetry</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
