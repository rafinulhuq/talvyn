"use client";

import Link from "next/link";
import { ArrowRight, Medal, ShieldCheck, Trophy } from "lucide-react";
import type { GlobalLeaderboardEntry } from "@/types/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
} from "@/types/evaluation";

type RankedEntry = GlobalLeaderboardEntry & { displayRank: number };

interface LeaderboardPodiumProps {
  topEntries: RankedEntry[];
  onSelectCandidate: (entry: GlobalLeaderboardEntry) => void;
}

export function LeaderboardPodium({ topEntries, onSelectCandidate }: LeaderboardPodiumProps) {
  if (topEntries.length === 0) return null;

  const first = topEntries[0];
  const second = topEntries.length > 1 ? topEntries[1] : null;
  const third = topEntries.length > 2 ? topEntries[2] : null;

  return (
    <section aria-label="Top 3 Ranked Candidates" className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
        
        {/* ── #2 Rank Card (Silver) ── */}
        {second ? (
          <div className="order-2 md:order-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Medal className="h-3.5 w-3.5 text-slate-500" />
                  #2 Rank
                </span>
                <span className="text-xl font-bold font-display text-slate-900 dark:text-white">
                  {second.percentage}%
                </span>
              </div>

              <div className="flex items-center gap-3 mb-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200 shrink-0 border border-slate-200 dark:border-slate-700">
                  {second.candidate_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {second.candidate_name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {second.jd_title}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
                {second.evaluation_level && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {EVALUATION_LEVEL_CONFIG[second.evaluation_level]?.label ?? second.evaluation_level}
                  </span>
                )}
                {(second.company_name || second.invited_by_name) && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 truncate max-w-[150px]">
                    {second.company_name || second.invited_by_name}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                {second.total_score}/{second.max_score} marks
              </span>
              <button
                type="button"
                onClick={() => onSelectCandidate(second)}
                className="font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 transition-colors"
              >
                Dossier <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:block order-1" />
        )}

        {/* ── #1 Hero Card (Gold Champion) ── */}
        <div className="order-1 md:order-2 rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-900 via-slate-900 to-slate-950 text-white p-6 shadow-xl flex flex-col justify-between transition-all md:-translate-y-2 relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">
                <Trophy className="h-4 w-4" />
                #1 Top Leader
              </span>
              <span className="text-3xl font-extrabold font-display tracking-tight text-white">
                {first.percentage}%
              </span>
            </div>

            <div className="flex items-center gap-3.5 mb-3.5">
              <div className="h-12 w-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md ring-2 ring-indigo-400/30">
                {first.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">
                  {first.candidate_name}
                </h3>
                <p className="text-xs text-indigo-200/80 truncate">
                  {first.jd_title} &bull; {first.test_title}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> 100% Genuine
              </span>
              <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-0.5 font-medium text-indigo-200">
                {RECOMMENDATION_CONFIG[first.admin_override_recommendation ?? first.ai_recommendation]?.label}
              </span>
              {first.evaluation_level && (
                <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 font-medium text-slate-200">
                  {EVALUATION_LEVEL_CONFIG[first.evaluation_level]?.label}
                </span>
              )}
            </div>

            {first.ai_summary && (
              <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed italic text-slate-300 line-clamp-2">
                &ldquo;{first.ai_summary}&rdquo;
              </p>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-white/10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectCandidate(first)}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-3 text-xs font-semibold text-center transition-colors shadow-xs"
            >
              Open Dossier
            </button>
            <Link
              href={`/dashboard/results/${first.attempt_id}`}
              className="rounded-lg border border-white/20 hover:bg-white/10 py-2 px-3 text-xs font-semibold text-center text-white transition-colors"
            >
              Report
            </Link>
          </div>
        </div>

        {/* ── #3 Bronze Card ── */}
        {third ? (
          <div className="order-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/20 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300">
                  <Medal className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                  #3 Rank
                </span>
                <span className="text-xl font-bold font-display text-slate-900 dark:text-white">
                  {third.percentage}%
                </span>
              </div>

              <div className="flex items-center gap-3 mb-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200 shrink-0 border border-slate-200 dark:border-slate-700">
                  {third.candidate_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {third.candidate_name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {third.jd_title}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
                {third.evaluation_level && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {EVALUATION_LEVEL_CONFIG[third.evaluation_level]?.label ?? third.evaluation_level}
                  </span>
                )}
                {(third.company_name || third.invited_by_name) && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 truncate max-w-[150px]">
                    {third.company_name || third.invited_by_name}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                {third.total_score}/{third.max_score} marks
              </span>
              <button
                type="button"
                onClick={() => onSelectCandidate(third)}
                className="font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 transition-colors"
              >
                Dossier <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:block order-3" />
        )}

      </div>
    </section>
  );
}
