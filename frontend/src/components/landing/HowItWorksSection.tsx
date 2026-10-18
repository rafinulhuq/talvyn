"use client";

import { useState } from "react";
import { Terminal, Cpu, ShieldCheck, Database, ArrowRight, CheckCircle2, Play } from "lucide-react";
import { TiltBlock } from "@/components/ui/TiltBlock";
import type { HomeContent } from "@/lib/cms/content";
import { cmsIcon } from "@/lib/cms/icons";

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
    <section id="how-it-works" className="border-b border-slate-300 bg-white py-24 font-sans text-slate-900 scroll-mt-20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {content.eyebrow || "System Workflow & 4-Phase Pipeline"}
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
            {content.title || "How Talvyn Operates"}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-slate-600 font-normal dark:text-slate-300">
            {content.body || "A zero-latency, tamper-proof hiring pipeline designed for modern technical teams."}
          </p>
        </div>

        {/* 4-Stage Interactive Architecture Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
                className={`cursor-pointer rounded-xl p-6 text-left transition-all duration-200 ${
                  isSelected
                    ? "border border-indigo-600 bg-indigo-600 text-white shadow-md -translate-y-1"
                    : "border border-slate-300/90 bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5 hover:border-slate-400 hover:shadow-sm -translate-y-0.5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-700"
                }`}
              >
                <div className={`flex items-center justify-between mb-4 border-b pb-2 ${isSelected ? "border-indigo-500" : "border-slate-200 dark:border-slate-800"}`}>
                  <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-900 dark:text-white"}`}>[{stage.step}]</span>
                  <span className={`text-[10px] font-semibold tracking-wider uppercase ${isSelected ? "text-indigo-200" : "text-slate-500 dark:text-slate-400"}`}>{stage.tag}</span>
                </div>
                <h3 className={`text-sm font-semibold mb-2 ${isSelected ? "text-white" : "text-slate-900 dark:text-white"}`}>{stage.title}</h3>
                <p className={`text-xs leading-relaxed ${isSelected ? "text-indigo-100" : "text-slate-600 font-normal dark:text-slate-300"}`}>{stage.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Interactive Telemetry Stream Terminal */}
        <div className="rounded-2xl border border-slate-300 bg-white p-6 sm:p-8 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2 text-xs text-slate-900 font-semibold dark:text-white">
              <Terminal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Stage {activeStage.step} Debug Stream &bull; {activeStage.tag}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Pipeline Monitor</span>
            </div>
          </div>

          <pre className="text-xs text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-xs font-mono">
            {activeStage.log}
          </pre>

          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 font-medium dark:text-slate-400">
            <span>Next Stage Transition: Automated in &lt;1.2s</span>
            <button
              type="button"
              onClick={() => setSelectedStage((selectedStage + 1) % 4)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all"
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
