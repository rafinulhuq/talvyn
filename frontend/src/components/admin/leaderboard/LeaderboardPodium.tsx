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
          <div className="order-2 md:order-1 rounded-2xl border border-white/8 bg-[#121317] p-5 shadow-xs text-white flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#181A1F] px-2.5 py-0.5 text-xs font-semibold text-white/90">
                  <Medal className="h-3.5 w-3.5 text-white/70" />
                  #2 Rank
                </span>
                <span className="text-xl font-bold font-display text-white">
                  {second.percentage}%
                </span>
              </div>

              <div className="flex items-center gap-3 mb-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#181A1F] font-bold text-sm text-white shrink-0 border border-white/10">
                  {second.candidate_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {second.candidate_name}
                  </h3>
                  <p className="text-xs text-white/70 truncate">
                    {second.jd_title}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-2 py-0.5 font-medium text-[#4ADE80]">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
                {second.evaluation_level && (
                  <span className="rounded-full border border-white/10 bg-[#181A1F] px-2 py-0.5 font-medium text-white/80">
                    {EVALUATION_LEVEL_CONFIG[second.evaluation_level]?.label ?? second.evaluation_level}
                  </span>
                )}
                {(second.company_name || second.invited_by_name) && (
                  <span className="rounded-full border border-white/10 bg-[#181A1F] px-2 py-0.5 text-white/70 truncate max-w-[150px]">
                    {second.company_name || second.invited_by_name}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/8 flex items-center justify-between text-xs">
              <span className="text-white/70 font-medium">
                {second.total_score}/{second.max_score} marks
              </span>
              <button
                type="button"
                onClick={() => onSelectCandidate(second)}
                className="font-semibold text-[#F2D74E] hover:text-[#F7E27A] flex items-center gap-1 transition-colors"
              >
                Dossier <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:block order-1" />
        )}

        {/* ── #1 Hero Card (Gold Champion) ── */}
        <div className="order-1 md:order-2 rounded-2xl border border-[#F2D74E]/40 bg-[#181A1F] text-white p-6 shadow-xl flex flex-col justify-between transition-all md:-translate-y-2 relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F2D74E]/40 bg-[#F2D74E]/10 px-3 py-1 text-xs font-bold text-[#F2D74E]">
                <Trophy className="h-4 w-4" />
                #1 Top Leader
              </span>
              <span className="text-3xl font-extrabold font-display tracking-tight text-white">
                {first.percentage}%
              </span>
            </div>

            <div className="flex items-center gap-3.5 mb-3.5">
              <div className="h-12 w-12 rounded-full bg-[#F2D74E] text-[#1A1600] flex items-center justify-center font-bold text-lg shrink-0 shadow-md">
                {first.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">
                  {first.candidate_name}
                </h3>
                <p className="text-xs text-white/80 truncate">
                  {first.jd_title} &bull; {first.test_title}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-2.5 py-0.5 font-medium text-[#4ADE80]">
                <ShieldCheck className="h-3.5 w-3.5" /> 100% Genuine
              </span>
              <span className="rounded-full border border-[#F2D74E]/30 bg-[#F2D74E]/10 px-2.5 py-0.5 font-medium text-[#F2D74E]">
                {RECOMMENDATION_CONFIG[first.admin_override_recommendation ?? first.ai_recommendation]?.label}
              </span>
              {first.evaluation_level && (
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-medium text-white">
                  {EVALUATION_LEVEL_CONFIG[first.evaluation_level]?.label}
                </span>
              )}
            </div>

            {first.ai_summary && (
              <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed italic text-white/90 line-clamp-2">
                &ldquo;{first.ai_summary}&rdquo;
              </p>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-white/10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectCandidate(first)}
              className="flex-1 rounded-lg bg-[#F2D74E] hover:bg-[#F7E27A] text-[#1A1600] py-2 px-3 text-xs font-semibold text-center transition-colors shadow-xs"
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
          <div className="order-3 rounded-2xl border border-white/8 bg-[#121317] p-5 shadow-xs text-white flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#181A1F] px-2.5 py-0.5 text-xs font-semibold text-white/90">
                  <Medal className="h-3.5 w-3.5 text-white/70" />
                  #3 Rank
                </span>
                <span className="text-xl font-bold font-display text-white">
                  {third.percentage}%
                </span>
              </div>

              <div className="flex items-center gap-3 mb-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#181A1F] font-bold text-sm text-white shrink-0 border border-white/10">
                  {third.candidate_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {third.candidate_name}
                  </h3>
                  <p className="text-xs text-white/70 truncate">
                    {third.jd_title}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-2 py-0.5 font-medium text-[#4ADE80]">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
                {third.evaluation_level && (
                  <span className="rounded-full border border-white/10 bg-[#181A1F] px-2 py-0.5 font-medium text-white/80">
                    {EVALUATION_LEVEL_CONFIG[third.evaluation_level]?.label ?? third.evaluation_level}
                  </span>
                )}
                {(third.company_name || third.invited_by_name) && (
                  <span className="rounded-full border border-white/10 bg-[#181A1F] px-2 py-0.5 text-white/70 truncate max-w-[150px]">
                    {third.company_name || third.invited_by_name}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/8 flex items-center justify-between text-xs">
              <span className="text-white/70 font-medium">
                {third.total_score}/{third.max_score} marks
              </span>
              <button
                type="button"
                onClick={() => onSelectCandidate(third)}
                className="font-semibold text-[#F2D74E] hover:text-[#F7E27A] flex items-center gap-1 transition-colors"
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
