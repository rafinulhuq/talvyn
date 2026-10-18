"use client";

import { clsx } from "clsx";
import { Info, ShieldAlert, UserCheck } from "lucide-react";
import type { AIRecommendation, EvaluationLevel } from "@/types/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
  RECOMMENDATION_THRESHOLDS,
} from "@/types/evaluation";

export function RecommendationBanner({
  aiRec,
  overrideRec,
  isPreliminary,
}: {
  aiRec: AIRecommendation;
  overrideRec: AIRecommendation | null;
  isPreliminary: boolean;
}) {
  const effective = overrideRec ?? aiRec;
  const cfg = RECOMMENDATION_CONFIG[effective];

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{cfg.emoji}</span>
          <div>
            <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {overrideRec ? "Admin Decision: " : "AI Recommendation: "}
              <span className="text-indigo-700 dark:text-indigo-300">{cfg.label}</span>
            </p>
            {overrideRec && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                AI suggested: {RECOMMENDATION_CONFIG[aiRec].label}
              </p>
            )}
          </div>
        </div>
        {isPreliminary && (
          <div className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-2xs dark:border-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Preliminary Assessment</span>
          </div>
        )}
      </div>
      {isPreliminary && (
        <p className="mt-3 border-t border-indigo-100 dark:border-indigo-900/60 pt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Note: This is an AI-generated preliminary evaluation to support review. Final hiring decisions should always be confirmed by the hiring team.
        </p>
      )}
    </div>
  );
}

export function HiringThresholdLegend() {
  const entries = Object.entries(RECOMMENDATION_CONFIG) as [
    AIRecommendation,
    (typeof RECOMMENDATION_CONFIG)[AIRecommendation],
  ][];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <Info className="h-4 w-4 text-indigo-600" />
        <p className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Hiring Recommendation Criteria
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map(([key, cfg]) => {
          const threshold = RECOMMENDATION_THRESHOLDS[key];
          return (
            <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-sm">{cfg.emoji}</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{cfg.label}</span>
              </div>
              <p className="font-display text-xs font-bold text-slate-900 dark:text-slate-100">{threshold.range}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {threshold.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EvaluationLevelBadge({ level }: { level: EvaluationLevel }) {
  const cfg = EVALUATION_LEVEL_CONFIG[level];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <span className="text-xl">{cfg.emoji}</span>
      <div>
        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{cfg.label}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{cfg.description}</p>
      </div>
    </div>
  );
}

export function SuitableRoleCard({ suitableRole }: { suitableRole: string }) {
  return (
    <div className="flex flex-1 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:min-w-52">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
        <UserCheck className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          Suitable For
        </p>
        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{suitableRole}</p>
      </div>
    </div>
  );
}

