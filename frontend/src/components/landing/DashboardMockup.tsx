"use client";

import { useState } from "react";
import { CheckCircle, ShieldAlert, FileText, Trophy, AlertTriangle } from "lucide-react";

export function DashboardMockup() {
  const [activeTab, setActiveTab] = useState<"leaderboard" | "integrity" | "summary">("leaderboard");

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
      
      {/* Top Browser Window Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-100 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-950/80 px-5 py-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 font-display text-xs font-bold text-zinc-700 dark:text-zinc-300 hidden sm:inline">
            Live Assessment &bull; Role: Digital Marketing Lead
          </span>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-2xs text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition font-semibold ${
              activeTab === "leaderboard"
                ? "bg-[#F2D74E] text-[#1A1600] font-bold"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Trophy className={`h-3.5 w-3.5 ${activeTab === "leaderboard" ? "text-[#1A1600]" : "text-[#F2D74E]"}`} />
            <span>Shortlist (3)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("integrity")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition font-semibold ${
              activeTab === "integrity"
                ? "bg-[#F87171] text-white font-bold"
                : "text-white/70 hover:text-white"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Anti-Cheat</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("summary")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition font-semibold ${
              activeTab === "summary"
                ? "bg-[#F2D74E] text-[#1A1600] font-bold"
                : "text-white/70 hover:text-white"
            }`}
          >
            <FileText className={`h-3.5 w-3.5 ${activeTab === "summary" ? "text-[#1A1600]" : "text-[#F2D74E]"}`} />
            <span>Recruiter Notes</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Ranked Leaderboard */}
      {activeTab === "leaderboard" && (
        <div className="p-5 sm:p-7 space-y-3.5">
          {/* Candidate 1 */}
          <div className="flex items-center gap-3.5 rounded-xl border border-indigo-200/90 bg-indigo-50/40 dark:border-indigo-900/60 dark:bg-indigo-950/30 p-4 transition hover:bg-indigo-50/70">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white shadow-sm">
              #1
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/50 font-display font-extrabold text-indigo-700 dark:text-indigo-300 text-sm">
              SJ
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">Sarah Johnson</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                  RECOMMENDED HIRE
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hidden sm:inline flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-emerald-600 inline" /> 100% Genuine Human
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-1">
                &ldquo;Reallocated 30% budget cut into high-intent search clusters with clear CAC math.&rdquo;
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="font-display text-xl font-extrabold text-indigo-600 dark:text-indigo-400">95%</span>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Match</p>
            </div>
          </div>

          {/* Candidate 2 */}
          <div className="flex items-center gap-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-850">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-300">
              #2
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 font-display font-bold text-amber-900 dark:text-amber-300 text-sm">
              DC
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">David Chen</span>
                <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                  STRONG MATCH
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                Strong creative copywriting; minor gaps in multi-touch attribution modeling.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="font-display text-xl font-bold text-zinc-800 dark:text-zinc-200">88%</span>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Match</p>
            </div>
          </div>

          {/* Candidate 3 */}
          <div className="flex items-center gap-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/30 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-200 dark:bg-rose-900/60 text-xs font-bold text-rose-800 dark:text-rose-200">
              #3
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/60 font-display font-bold text-rose-900 dark:text-rose-200 text-sm">
              AR
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">Alex Rivera</span>
                <span className="rounded-full bg-rose-100 dark:bg-rose-950/80 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:text-rose-300">
                  ⚠️ AI CHEATING DETECTED
                </span>
              </div>
              <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5 line-clamp-1">
                Candidate copied answers directly from ChatGPT during the timed test.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="font-display text-xl font-bold text-rose-600 dark:text-rose-400">42%</span>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Risk</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Anti-Cheat Telemetry */}
      {activeTab === "integrity" && (
        <div className="p-5 sm:p-7 space-y-4">
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 p-4">
            <h4 className="font-display font-bold text-xs text-rose-950 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              Transparent Anti-Cheat Telemetry Audit
            </h4>
            <p className="mt-1 text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
              Talvyn monitors typing cadences, copy-pasting, and AI sentence patterns so honest candidates are protected and ChatGPT copycats are flagged.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">Sarah Johnson</span>
              <p className="text-base font-bold text-emerald-700 dark:text-emerald-400 mt-1">100% Genuine</p>
              <p className="text-[10px] text-zinc-400">Natural typing cadence</p>
            </div>
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">David Chen</span>
              <p className="text-base font-bold text-emerald-700 dark:text-emerald-400 mt-1">94% Genuine</p>
              <p className="text-[10px] text-zinc-400">Zero tab switches</p>
            </div>
            <div className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30">
              <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold">Alex Rivera</span>
              <p className="text-base font-bold text-rose-600 dark:text-rose-400 mt-1">89% AI Phrasing</p>
              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">14 copy-pastes flagged</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Plain-English Recruiter Summary */}
      {activeTab === "summary" && (
        <div className="p-5 sm:p-7 space-y-3.5">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-xs text-zinc-900 dark:text-white">
                Hiring Advice for Sarah Johnson
              </h4>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                RECOMMENDATION: HIRE
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-serif italic text-[13px]">
              &ldquo;Sarah is in the top 5% of candidates tested. She demonstrated practical clarity in CPA calculations, customer acquisition funnels, and channel reallocation. Zero cheating flags detected.&rdquo;
            </p>
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-600 dark:text-zinc-400">Recommended Next Step:</span>
              <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                Schedule 30-min Final Interview
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
