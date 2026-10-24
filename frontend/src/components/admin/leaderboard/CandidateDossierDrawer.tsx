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
            "w-screen max-w-xl bg-[#121317] border-l border-white/10 shadow-2xl flex flex-col justify-between text-white",
            closing ? "animate-slide-out-right" : "animate-slide-in-right",
            "motion-reduce:animate-none"
          )}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#121317]">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#181A1F] font-bold text-sm text-[#F2D74E] border border-[#F2D74E]/30 shrink-0 shadow-xs">
                {entry.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white truncate">
                    {entry.candidate_name}
                  </h2>
                  <span className="rounded-full border border-[#F2D74E]/30 bg-[#F2D74E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F2D74E] shrink-0">
                    Rank #{entry.rank}
                  </span>
                </div>
                <p className="text-xs text-white/70 truncate">
                  {entry.candidate_email} &bull; Evaluated {formatDate(entry.evaluated_at)}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#181A1F] hover:bg-white/10 text-white transition-colors shrink-0"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="stagger flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[#0B0C0E]">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/8 bg-[#121317] p-3.5 text-center shadow-xs">
                <span className="text-[10px] text-white/70 uppercase tracking-wider font-semibold">
                  Overall Score
                </span>
                <div className="text-2xl font-bold font-display mt-0.5 text-white">
                  {entry.percentage}%
                </div>
                <span className="text-[10px] text-white/70 font-medium">
                  {entry.total_score}/{entry.max_score} marks
                </span>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#121317] p-3.5 text-center shadow-xs">
                <span className="text-[10px] text-white/70 uppercase tracking-wider font-semibold">
                  Evaluation
                </span>
                <div className="mt-1">
                  {levelCfg ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-white">
                      {levelCfg.emoji} {levelCfg.label}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-white/80">Standard</span>
                  )}
                </div>
                <span className="text-[10px] text-white/70 block mt-0.5">
                  {entry.passed ? "Passed Threshold" : "Below Cutoff"}
                </span>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#121317] p-3.5 text-center shadow-xs">
                <span className="text-[10px] text-white/70 uppercase tracking-wider font-semibold">
                  Integrity
                </span>
                <div className="text-xs font-semibold text-[#4ADE80] mt-1 flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </div>
                <span className="text-[10px] text-white/70 block mt-0.5">Anti-Cheat Passed</span>
              </div>
            </div>

            {/* Assessment Target */}
            <div className="rounded-xl border border-white/8 bg-[#121317] p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/70 font-medium uppercase tracking-wider text-[10px]">Job Opening</span>
                <span className="font-semibold text-white">{entry.jd_title}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/70 font-medium uppercase tracking-wider text-[10px]">Assessment</span>
                <span className="font-semibold text-white">{entry.test_title}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/70 font-medium uppercase tracking-wider text-[10px]">Test Type</span>
                <span className="rounded-md border border-[#F2D74E]/30 bg-[#F2D74E]/10 px-2 py-0.5 font-medium text-[10px] text-[#F2D74E]">
                  {entry.test_type}
                </span>
              </div>
            </div>

            {/* Sponsoring Recruiter & Organization */}
            {(entry.company_name || entry.invited_by_name || entry.invited_by_email) && (
              <div className="rounded-xl border border-white/8 bg-[#121317] p-4 space-y-2 shadow-xs">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                  Sponsoring Recruiter &amp; Org
                </span>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-white/60 shrink-0" />
                    <span className="font-semibold text-white">
                      {entry.company_name || "Direct Assessment"}
                    </span>
                  </div>
                  {entry.invited_by_name && (
                    <span className="text-white/70 font-medium">
                      {entry.invited_by_name} {entry.invited_by_email ? `(${entry.invited_by_email})` : ""}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Direct Candidate Contact & Profile Links */}
            {(entry.candidate_phone || entry.candidate_linkedin_url || entry.candidate_resume_url || entry.candidate_number) && (
              <div className="rounded-xl border border-white/8 bg-[#121317] p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                    Candidate Documents
                  </span>
                  {entry.candidate_number && (
                    <span className="text-[11px] font-mono text-white/80 rounded-md border border-white/10 bg-[#181A1F] px-2 py-0.5">
                      ID #{entry.candidate_number}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {entry.candidate_phone && (
                    <a
                      href={`tel:${entry.candidate_phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181A1F] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-white/10 transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5 text-white/60" />
                      <span>{entry.candidate_phone}</span>
                    </a>
                  )}
                  {entry.candidate_linkedin_url && (
                    <a
                      href={entry.candidate_linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181A1F] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-white/10 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-white/60" />
                      <span>LinkedIn Profile</span>
                    </a>
                  )}
                  {entry.candidate_resume_url && (
                    <a
                      href={entry.candidate_resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181A1F] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-white/10 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 text-white/60" />
                      <span>Curriculum Vitae</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Score Breakdown Bars */}
            <div className="rounded-xl border border-white/8 bg-[#121317] p-4 space-y-3 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                Score Breakdown
              </span>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-white/80">
                      Objective Multiple Choice (MCQ)
                    </span>
                    <span className="tabular-nums font-semibold text-white">
                      {entry.mcq_score}/{entry.mcq_max} ({mcqPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#181A1F] border border-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#F2D74E] origin-left transition-all duration-500"
                      style={{ width: `${Math.min(100, mcqPct)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-white/80">
                      Practical &amp; Open-Ended Problem Solving
                    </span>
                    <span className="tabular-nums font-semibold text-white">
                      {entry.open_ended_score}/{entry.open_ended_max} ({openEndedPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#181A1F] border border-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#F2D74E] origin-left transition-all duration-500"
                      style={{ width: `${Math.min(100, openEndedPct)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* AI Recommendation Card */}
            <div className="rounded-xl border border-white/8 bg-[#121317] p-4 space-y-2.5 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                Recommendation Verdict
              </span>
              <div className="inline-flex items-center gap-3 rounded-lg border border-[#F2D74E]/30 bg-[#F2D74E]/10 p-3 w-full">
                <span className="text-xl">{recCfg.emoji}</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-white">{recCfg.label}</p>
                  <p className="text-[11px] text-white/70">
                    Expected Range: {RECOMMENDATION_THRESHOLDS[effectiveRec].range}
                  </p>
                </div>
              </div>
              {entry.admin_override_recommendation && (
                <p className="text-xs text-white/70">
                  Note: AI original suggestion was{" "}
                  <strong className="text-white">{RECOMMENDATION_CONFIG[entry.ai_recommendation].label}</strong> (Overridden by Admin).
                </p>
              )}
            </div>

            {/* AI Summary */}
            {entry.ai_summary && (
              <div className="rounded-xl border border-white/8 bg-[#121317] p-4 space-y-1.5 shadow-xs">
                <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-[#F2D74E]" />
                  AI Assessment Summary
                </h3>
                <p className="text-xs text-white/80 leading-relaxed italic">
                  &ldquo;{entry.ai_summary}&rdquo;
                </p>
              </div>
            )}

            {/* Anti-Cheat & Telemetry Audit */}
            <div className="rounded-xl border border-white/8 bg-[#121317] p-4 space-y-3 shadow-xs">
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-[#F2D74E]" />
                Anti-Cheat Telemetry Audit
              </h3>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-lg border border-white/10 bg-[#181A1F] p-2.5">
                  <span className="text-[10px] font-medium text-white/70">Typing Cadence</span>
                  <p className="font-semibold text-white mt-0.5">
                    Natural Dynamic
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#181A1F] p-2.5">
                  <span className="text-[10px] font-medium text-white/70">Focus Window</span>
                  <p className="font-semibold text-white mt-0.5">
                    Active in Browser
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#181A1F] p-2.5">
                  <span className="text-[10px] font-medium text-white/70">Clipboard Events</span>
                  <p className="font-semibold text-white mt-0.5">
                    No Bulk Pastes
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#181A1F] p-2.5">
                  <span className="text-[10px] font-medium text-white/70">Exam Integrity</span>
                  <p className="font-semibold text-[#4ADE80] mt-0.5">
                    100% Genuine
                  </p>
                </div>
              </div>
            </div>

            {/* Suggested Follow-up Interview Prompts */}
            <div className="rounded-xl border border-[#F2D74E]/30 bg-[#F2D74E]/10 p-4 space-y-2 shadow-xs">
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#F2D74E]" />
                Recommended Final Interview Discussion
              </h3>
              <p className="text-xs text-white/90 leading-relaxed">
                1. <em>&ldquo;Can you walk us through the tradeoffs you made in your practical problem solving response for {entry.test_title}?&rdquo;</em>
              </p>
              <p className="text-xs text-white/90 leading-relaxed">
                2. <em>&ldquo;How would your solution adapt if resources or deployment timeframes were cut in half?&rdquo;</em>
              </p>
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-5 border-t border-white/10 bg-[#121317] flex items-center gap-3">
            <Link
              href={`/dashboard/results/${entry.attempt_id}`}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#F2D74E] text-[#1A1600] font-semibold text-xs py-3 shadow-xs hover:bg-[#F7E27A] transition-colors"
            >
              <span>View Full Evaluation Report</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <button
              onClick={copyShareLink}
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#181A1F] px-4 py-3 text-xs font-semibold text-white shadow-xs hover:bg-white/10 transition-colors"
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
