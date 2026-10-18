"use client";

import { Search } from "lucide-react";
import type { GlobalLeaderboardEntry } from "@/types/evaluation";
import { LeaderboardCandidateRow } from "@/components/admin/leaderboard/LeaderboardCandidateRow";

type RankedLeaderboardEntry = GlobalLeaderboardEntry & { displayRank: number };

export function LeaderboardTable({
  displayed,
  onClearFilters,
  onSelectCandidate,
}: {
  displayed: RankedLeaderboardEntry[];
  onClearFilters: () => void;
  onSelectCandidate?: (entry: GlobalLeaderboardEntry) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      {/* Column header */}
      <div className="hidden items-center gap-3 border-b border-slate-200 bg-slate-50/80 text-slate-500 px-5 py-3 sm:flex text-xs font-semibold uppercase tracking-wider dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
        <span className="w-8">#</span>
        <span className="w-9 shrink-0" />
        <span className="flex-1">Candidate</span>
        <span className="hidden lg:block w-48 text-right">JD / Test</span>
        <span className="hidden sm:block w-16 text-right">Score</span>
        <span className="hidden md:block w-28">Level</span>
        <span className="hidden xl:block w-28">Recommend.</span>
        <span className="hidden w-14 sm:block">Status</span>
        <span className="hidden lg:block w-16">Integrity</span>
        {onSelectCandidate && <span className="hidden sm:block w-16">Dossier</span>}
        <span className="w-4 shrink-0" />
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center bg-white dark:bg-slate-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Search className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No candidates match your filters.</p>
          <button
            onClick={onClearFilters}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        displayed.map((entry) => (
          <LeaderboardCandidateRow
            key={entry.attempt_id}
            entry={entry}
            globalRank={entry.displayRank}
            onOpenDossier={onSelectCandidate}
          />
        ))
      )}
    </div>
  );
}
