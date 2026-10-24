"use client";

import { useState } from "react";
import { Terminal, ArrowRight } from "lucide-react";
import type { HomeContent } from "@/lib/cms/content";

const STAGE_DETAILS = [
  {
    step: "01",
    tag: "INGEST_SPEC",
    title: "Upload Job Description",
    desc: "Ingests raw PDF, DOCX, or text requirements and extracts nuanced skill trees, seniority calibrations, and core technical requirements without manual tagging.",
    log: `> INGESTION_ENGINE: PARSING_RAW_JD
[INFO] Extracted 8 Primary Skill Vectors
[INFO] Seniority Calibration: Staff / Lead
[OK] Generating Domain Rubric Matrix...`,
  },
  {
    step: "02",
    tag: "GENERATE_TEST",
    title: "Synthesize Real-World Scenarios",
    desc: "Generates job-specific questions, live debugging environments, and behavioral scenario challenges tailored directly to your team's real challenges.",
    log: `> SCENARIO_GEN: EVAL_PIPELINE
[OK] 3 Real-World Architectural Scenarios Generated
[OK] 1 Live Code Debugging Session Configured
[OK] Passive Telemetry Sensors Active`,
  },
  {
    step: "03",
    tag: "PASSIVE_PROCTOR",
    title: "Timed Candidate Cockpit",
    desc: "Candidates enter a frictionless, zero-install web cockpit. Keystroke flight dynamics, tab-focus triggers, and paste injections are tracked passively.",
    log: `> COCKPIT_HUD: ACTIVE_SESSION
[TELEMETRY] Keystroke Variance: 142 WPM (Natural)
[INTEGRITY] External GPT Injections: 0 Detected
[OK] Candidate Progress: 100% Complete`,
  },
  {
    step: "04",
    tag: "CALIBRATE_FIT",
    title: "Defensible AI Shortlist",
    desc: "Every answer is calibrated against exact grading criteria. You receive a ranked shortlist, pass/fail status, and plain-English hiring summaries.",
    log: `> SCORING_MODEL: EVAL_COMPLETE
[SCORE] Match Calibration: 96.4% // Strong Hire
[SUMMARY] "Demonstrated staff-level architectural maturity"
[ACTION] Shortlisted for Team Final Interview`,
  },
];

export function HowItWorksSection({ content }: { content: HomeContent["howItWorks"] }) {
  const [selectedStage, setSelectedStage] = useState(0);
  const activeStage = STAGE_DETAILS[selectedStage] ?? STAGE_DETAILS[0];

  return (
    <section id="how-it-works" className="mt-28">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#F2D74E] block">
            {content.eyebrow || "System Workflow & 4-Phase Pipeline"}
          </span>
          <h2 className="mt-3.5 text-[clamp(30px,4vw,44px)] font-[650] tracking-[-0.035em] max-w-[20ch] mx-auto text-balance text-white">
            {content.title || "How Talvyn Operates"}
          </h2>
          <p className="mt-4 text-[16px] text-[#8A8F98] max-w-[56ch] mx-auto">
            {content.body || "A zero-latency, tamper-proof hiring pipeline designed for modern technical teams."}
          </p>
        </div>

        {/* 4-Stage Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-6">
          {STAGE_DETAILS.map((stage, idx) => {
            const isSelected = selectedStage === idx;
            return (
              <div
                key={stage.step}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedStage(idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedStage(idx);
                }}
                className={`cursor-pointer rounded-[14px] p-5 text-left transition-colors ${
                  isSelected
                    ? "border border-[#F2D74E] bg-[#181A1F] text-white"
                    : "border border-white/[0.08] bg-[#121317] text-[#8A8F98] hover:text-white hover:border-white/[0.18]"
                }`}
              >
                <div className="flex items-center justify-between mb-3 border-b border-white/[0.06] pb-2 font-mono text-xs">
                  <span className={`font-bold ${isSelected ? "text-[#F2D74E]" : "text-white"}`}>
                    [{stage.step}]
                  </span>
                  <span className="text-[10px] tracking-wider uppercase text-[#5A5F68]">
                    {stage.tag}
                  </span>
                </div>
                <h3 className={`text-[14px] font-semibold mb-1.5 ${isSelected ? "text-white" : "text-white"}`}>
                  {stage.title}
                </h3>
                <p className="text-[12px] leading-relaxed text-[#8A8F98]">
                  {stage.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Telemetry Stream Console */}
        <div className="rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 sm:p-7">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Terminal className="h-4 w-4 text-[#F2D74E]" />
              <span>Stage {activeStage.step} Telemetry Stream · {activeStage.tag}</span>
            </div>
            <div className="flex items-center gap-2 text-[#4ADE80]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
              <span>Live Monitor</span>
            </div>
          </div>

          <pre className="text-xs text-white leading-relaxed overflow-x-auto whitespace-pre-wrap bg-[#0B0C0E] border border-white/[0.08] rounded-[10px] p-5 font-mono">
            {activeStage.log}
          </pre>

          <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between text-xs text-[#5A5F68] font-mono">
            <span>Next Stage Transition: Automated in &lt;1.2s</span>
            <button
              type="button"
              onClick={() => setSelectedStage((selectedStage + 1) % 4)}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#F2D74E] px-3.5 py-1.5 text-xs font-semibold text-[#1A1600] hover:bg-[#F7E27A] transition-colors"
            >
              <span>Cycle Next Stage</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
