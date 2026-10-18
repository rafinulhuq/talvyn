"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Building2,
  Copy,
  ExternalLink,
  FileText,
  Phone,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import type { GlobalLeaderboardEntry, AIRecommendation, EvaluationLevel } from "@/types/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
  RECOMMENDATION_THRESHOLDS,
} from "@/types/evaluation";

interface CandidateDossierDrawerProps {
  entry: GlobalLeaderboardEntry | null;
  onClose: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CandidateDossierDrawer({ entry: openEntry, onClose }: CandidateDossierDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState<GlobalLeaderboardEntry | null>(openEntry);

  if (openEntry && openEntry !== shown) setShown(openEntry);

  const closing = !openEntry && !!shown;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (openEntry) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [openEntry, onClose]);

  if (!shown) return null;

  const entry = shown;
  const effectiveRec = (entry.admin_override_recommendation ?? entry.ai_recommendation) as AIRecommendation;
  const recCfg = RECOMMENDATION_CONFIG[effectiveRec];
  const levelCfg = entry.evaluation_level
    ? EVALUATION_LEVEL_CONFIG[entry.evaluation_level as EvaluationLevel]
    : null;

  const mcqPct = entry.mcq_max > 0 ? Math.round((entry.mcq_score / entry.mcq_max) * 100) : 0;
  const openEndedPct =
    entry.open_ended_max > 0
      ? Math.round((entry.open_ended_score / entry.open_ended_max) * 100)
      : 0;

  function copyShareLink() {
    if (typeof window === "undefined" || !entry) return;
    const url = `${window.location.origin}/dashboard/results/${entry.attempt_id}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 bg-slate-950/60 backdrop-blur-sm",
          closing ? "animate-fade-backdrop-out" : "animate-fade-backdrop",
          "motion-reduce:animate-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-6">
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`Dossier for ${entry.candidate_name}`}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && closing) setShown(null);
          }}
          className={clsx(
            "w-screen max-w-xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between",
            closing ? "animate-slide-out-right" : "animate-slide-in-right",
            "motion-reduce:animate-none"
          )}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 font-bold text-sm text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/60 shrink-0 shadow-xs">
                {entry.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                    {entry.candidate_name}
                  </h2>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300 shrink-0">
                    Rank #{entry.rank}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {entry.candidate_email} &bull; Evaluated {formatDate(entry.evaluated_at)}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors shrink-0"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="stagger flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50/50 dark:bg-slate-950/40">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Overall Score
                </span>
                <div className="text-2xl font-bold font-display mt-0.5 text-slate-900 dark:text-white">
                  {entry.percentage}%
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {entry.total_score}/{entry.max_score} marks
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Evaluation
                </span>
                <div className="mt-1">
                  {levelCfg ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {levelCfg.emoji} {levelCfg.label}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-slate-500">Standard</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {entry.passed ? "Passed Threshold" : "Below Cutoff"}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Integrity
                </span>
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-1 flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Anti-Cheat Passed</span>
              </div>
            </div>

            {/* Assessment Target */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">Job Opening</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{entry.jd_title}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">Assessment</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{entry.test_title}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">Test Type</span>
                <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-medium text-[10px] text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {entry.test_type}
                </span>
              </div>
            </div>

            {/* Sponsoring Recruiter & Organization */}
            {(entry.company_name || entry.invited_by_name || entry.invited_by_email) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Sponsoring Recruiter &amp; Org
                </span>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {entry.company_name || "Direct Assessment"}
                    </span>
                  </div>
                  {entry.invited_by_name && (
                    <span className="text-slate-500 font-medium">
                      {entry.invited_by_name} {entry.invited_by_email ? `(${entry.invited_by_email})` : ""}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Direct Candidate Contact & Profile Links */}
            {(entry.candidate_phone || entry.candidate_linkedin_url || entry.candidate_resume_url || entry.candidate_number) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Candidate Documents
                  </span>
                  {entry.candidate_number && (
                    <span className="text-[11px] font-mono text-slate-500 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-800">
                      ID #{entry.candidate_number}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {entry.candidate_phone && (
                    <a
                      href={`tel:${entry.candidate_phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>{entry.candidate_phone}</span>
                    </a>
                  )}
                  {entry.candidate_linkedin_url && (
                    <a
                      href={entry.candidate_linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      <span>LinkedIn Profile</span>
                    </a>
                  )}
                  {entry.candidate_resume_url && (
                    <a
                      href={entry.candidate_resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      <span>Curriculum Vitae</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Score Breakdown Bars */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Score Breakdown
              </span>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-slate-600 dark:text-slate-400">
                      Objective Multiple Choice (MCQ)
                    </span>
                    <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                      {entry.mcq_score}/{entry.mcq_max} ({mcqPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 origin-left transition-all duration-500"
                      style={{ width: `${Math.min(100, mcqPct)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-slate-600 dark:text-slate-400">
                      Practical &amp; Open-Ended Problem Solving
                    </span>
                    <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                      {entry.open_ended_score}/{entry.open_ended_max} ({openEndedPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 origin-left transition-all duration-500"
                      style={{ width: `${Math.min(100, openEndedPct)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* AI Recommendation Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Recommendation Verdict
              </span>
              <div className="inline-flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 w-full dark:border-indigo-900/50 dark:bg-indigo-950/30">
                <span className="text-xl">{recCfg.emoji}</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{recCfg.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Expected Range: {RECOMMENDATION_THRESHOLDS[effectiveRec].range}
                  </p>
                </div>
              </div>
              {entry.admin_override_recommendation && (
                <p className="text-xs text-slate-500">
                  Note: AI original suggestion was{" "}
                  <strong>{RECOMMENDATION_CONFIG[entry.ai_recommendation].label}</strong> (Overridden by Admin).
                </p>
              )}
            </div>

            {/* AI Summary */}
            {entry.ai_summary && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-indigo-500" />
                  AI Assessment Summary
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">
                  &ldquo;{entry.ai_summary}&rdquo;
                </p>
              </div>
            )}

            {/* Anti-Cheat & Telemetry Audit */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-indigo-500" />
                Anti-Cheat Telemetry Audit
              </h3>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[10px] font-medium text-slate-400">Typing Cadence</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    Natural Dynamic
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[10px] font-medium text-slate-400">Focus Window</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    Active in Browser
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[10px] font-medium text-slate-400">Clipboard Events</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    No Bulk Pastes
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[10px] font-medium text-slate-400">Exam Integrity</span>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    100% Genuine
                  </p>
                </div>
              </div>
            </div>

            {/* Suggested Follow-up Interview Prompts */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2 shadow-xs dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <h3 className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                Recommended Final Interview Discussion
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                1. <em>&ldquo;Can you walk us through the tradeoffs you made in your practical problem solving response for {entry.test_title}?&rdquo;</em>
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                2. <em>&ldquo;How would your solution adapt if resources or deployment timeframes were cut in half?&rdquo;</em>
              </p>
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
            <Link
              href={`/dashboard/results/${entry.attempt_id}`}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white font-semibold text-xs py-3 shadow-xs hover:bg-indigo-700 transition-colors"
            >
              <span>View Full Evaluation Report</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <button
              onClick={copyShareLink}
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
              title="Copy link to report"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copied ? "Copied!" : "Share"}</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
