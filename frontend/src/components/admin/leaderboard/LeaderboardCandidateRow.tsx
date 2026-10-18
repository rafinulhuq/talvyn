"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import {
  Brain,
  Building2,
  CheckCircle,
  ChevronDown,
  Code2,
  ExternalLink,
  FileText,
  Medal,
  Minus,
  Phone,
  ShieldCheck,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import type {
  AIRecommendation,
  EvaluationLevel,
  GlobalLeaderboardEntry,
} from "@/types/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
  RECOMMENDATION_THRESHOLDS,
  getScoreColor,
} from "@/types/evaluation";

const TEST_TYPE_CONFIG: Record<
  string,
  { label: string; variant: "blue" | "purple" | "green"; icon: ComponentType<{ className?: string }> }
> = {
  TECHNICAL: { label: "Technical", variant: "blue", icon: Code2 },
  BEHAVIORAL: { label: "Behavioral", variant: "purple", icon: Brain },
  PROBLEM_SOLVING: { label: "Problem Solving", variant: "green", icon: FileText },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-300">
        <Trophy className="h-4 w-4 text-amber-600" />
      </span>
    );
  if (rank === 2)
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-300">
        <Medal className="h-4 w-4 text-slate-500" />
      </span>
    );
  if (rank === 3)
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200">
        <Medal className="h-4 w-4 text-amber-600" />
      </span>
    );
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-xs font-semibold text-slate-500 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      {rank}
    </span>
  );
}

function PassBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) return <Minus className="h-4 w-4 text-slate-400" />;
  return passed ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
      <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      PASS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300">
      <XCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
      FAIL
    </span>
  );
}

function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
          {score}/{max} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 origin-left transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function LeaderboardCandidateRow({
  entry,
  globalRank,
  onOpenDossier,
}: {
  entry: GlobalLeaderboardEntry;
  globalRank: number;
  onOpenDossier?: (entry: GlobalLeaderboardEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const effectiveRec = (entry.admin_override_recommendation ?? entry.ai_recommendation) as AIRecommendation;
  const recCfg = RECOMMENDATION_CONFIG[effectiveRec];
  const levelCfg = entry.evaluation_level
    ? EVALUATION_LEVEL_CONFIG[entry.evaluation_level]
    : null;
  const testType = TEST_TYPE_CONFIG[entry.test_type] ?? {
    label: entry.test_type,
    variant: "default" as const,
    icon: FileText,
  };

  return (
    <div className="border-b border-slate-100 last:border-0 bg-white dark:border-slate-800/80 dark:bg-slate-900">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="group/row flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-slate-50/70 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4 dark:hover:bg-slate-800/50"
      >
        <div className="flex w-full min-w-0 items-center gap-3 sm:flex-1">
          <div className="shrink-0">
            <RankBadge rank={globalRank} />
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-bold text-sm text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/60 shadow-xs">
            {entry.candidate_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{entry.candidate_name}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="truncate">{entry.candidate_email}</span>
              {(entry.company_name || entry.invited_by_name) && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                  <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                    🏢 {entry.company_name || entry.invited_by_name}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Score + chevron on mobile */}
          <div className="shrink-0 text-right sm:hidden">
            <p className={clsx("text-base font-bold tabular-nums", getScoreColor(entry.percentage))}>
              {entry.percentage}%
            </p>
            <p className="text-[10px] text-slate-400">{entry.total_score}/{entry.max_score}</p>
          </div>
          <div className="shrink-0 text-slate-400 sm:hidden">
            <ChevronDown
              className={clsx(
                "h-5 w-5 transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
          </div>
        </div>

        {/* Mobile status chips */}
        <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
          {levelCfg && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {levelCfg.emoji} {levelCfg.label}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
            {recCfg.emoji} {recCfg.label}
          </span>
          <PassBadge passed={entry.passed} />
        </div>

        {/* ── Wide-screen columns ─────────────────────────────────── */}
        <div className="hidden w-48 min-w-0 shrink-0 flex-col items-end gap-1 lg:flex">
          <p className="w-full truncate text-right text-xs font-medium text-slate-800 dark:text-slate-200">{entry.jd_title}</p>
          <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {testType.label}
          </span>
        </div>
        <div className="hidden w-16 shrink-0 text-right sm:block">
          <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
            {entry.percentage}%
          </p>
          <p className="text-[10px] text-slate-400">{entry.total_score}/{entry.max_score}</p>
        </div>
        {levelCfg && (
          <div className="hidden w-28 shrink-0 items-center gap-1.5 md:flex">
            <span className="text-sm">{levelCfg.emoji}</span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{levelCfg.label}</span>
          </div>
        )}
        <div className="hidden w-28 shrink-0 xl:block">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {recCfg.emoji} {recCfg.label}
          </span>
        </div>
        <div className="hidden w-14 shrink-0 sm:block">
          <PassBadge passed={entry.passed} />
        </div>
        <div className="hidden w-16 lg:flex shrink-0 items-center">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" />
            Verified
          </span>
        </div>
        {onOpenDossier && (
          <div className="hidden w-16 sm:flex shrink-0 items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDossier(entry);
              }}
              className="rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 px-2.5 py-1 text-xs font-semibold shadow-xs transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Dossier
            </button>
          </div>
        )}
        <div className="hidden shrink-0 text-slate-400 sm:block">
          <ChevronDown
            className={clsx(
              "h-4 w-4 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-5 sm:px-6 dark:border-slate-800 dark:bg-slate-850/50">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Candidate</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.candidate_name}</p>
              <p className="text-xs text-slate-500">{entry.candidate_email}</p>
              {entry.candidate_number && (
                <p className="text-[10px] text-slate-400 font-mono">Candidate #{entry.candidate_number}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                Evaluated {formatDate(entry.evaluated_at)}
              </p>
            </div>

            {(entry.candidate_phone || entry.candidate_linkedin_url || entry.candidate_resume_url) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact &amp; Profiles</p>
                {entry.candidate_phone && (
                  <a href={`tel:${entry.candidate_phone}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-indigo-600 dark:text-slate-300">
                    <Phone className="h-3.5 w-3.5" />
                    {entry.candidate_phone}
                  </a>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  {entry.candidate_linkedin_url && (
                    <a
                      href={entry.candidate_linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      LinkedIn
                    </a>
                  )}
                  {entry.candidate_resume_url && (
                    <a
                      href={entry.candidate_resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <FileText className="h-3 w-3" />
                      Resume
                    </a>
                  )}
                </div>
              </div>
            )}

            {(entry.company_name || entry.invited_by_name || entry.invited_by_email) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sponsoring Org</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  {entry.company_name || "Direct Assessment"}
                </p>
                <p className="text-xs text-slate-500">
                  {entry.invited_by_name} {entry.invited_by_email ? `(${entry.invited_by_email})` : ""}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assessment</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{entry.test_title}</p>
              <p className="text-xs text-slate-500 truncate">{entry.jd_title}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Score Breakdown</p>
              <ScoreBar score={entry.mcq_score} max={entry.mcq_max} label="MCQ" />
              <ScoreBar score={entry.open_ended_score} max={entry.open_ended_max} label="Open-ended" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recommendation</p>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-lg">{recCfg.emoji}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{recCfg.label}</p>
                  <p className="text-[10px] text-slate-400">{RECOMMENDATION_THRESHOLDS[effectiveRec].range}</p>
                </div>
              </div>
            </div>

            {entry.ai_summary && (
              <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Summary</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs leading-relaxed dark:border-slate-800 dark:bg-slate-900 italic">
                  &ldquo;{entry.ai_summary}&rdquo;
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3 pt-2">
              <Link
                href={`/dashboard/results/${entry.attempt_id}`}
                className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Full Evaluation Report
              </Link>

              {onOpenDossier && (
                <button
                  type="button"
                  onClick={() => onOpenDossier(entry)}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                  Slide-out Full Dossier
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
