"use client";

import { clsx } from "clsx";
import { TestTimer } from "@/components/candidate/TestTimer";
import { Badge } from "@/components/ui/Badge";
import type { ExamSectionResponse, SectionType } from "@/types/exam";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";

type SectionExamHeaderProps = {
  section: ExamSectionResponse;
  testTitle: string;
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  isOnline: boolean;
  saveError: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  formatted: string;
  urgency: "normal" | "warning" | "critical";
};

export function SectionExamHeader({
  section,
  testTitle,
  currentIndex,
  totalQuestions,
  answeredCount,
  isOnline,
  saveError,
  isSaving,
  lastSavedAt,
  formatted,
  urgency,
}: SectionExamHeaderProps) {
  const percentComplete = Math.round((answeredCount / Math.max(1, totalQuestions)) * 100);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-xs px-4 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        {/* Left: Section identifier & question progress */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center rounded-md bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs">
            Section {section.section_index + 1}/{section.total_sections}
          </span>
          <div className="hidden sm:block">
            <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {testTitle}
            </h1>
          </div>
          <span className="hidden text-xs text-slate-300 dark:text-slate-700 sm:inline">
            •
          </span>
          <span className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
            Q{currentIndex + 1} of {totalQuestions} ({answeredCount} answered, {percentComplete}%)
          </span>
        </div>

        {/* Right: Autosave status & Countdown Timer HUD */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden items-center gap-1.5 text-xs font-medium sm:flex">
            {isSaving ? (
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <RefreshCw className="h-3 w-3 animate-spin text-indigo-600 dark:text-indigo-400" />
                Saving…
              </span>
            ) : !isOnline ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400">
                <CloudOff className="h-3.5 w-3.5" />
                Offline (Saved locally)
              </span>
            ) : saveError ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-400">
                <CloudOff className="h-3.5 w-3.5" />
                Retrying sync…
              </span>
            ) : lastSavedAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Cloud className="h-3.5 w-3.5" />
                Synced
              </span>
            ) : null}
          </div>

          <TestTimer formatted={formatted} urgency={urgency} />
        </div>
      </div>

      {/* Progress bar along bottom hairline */}
      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300"
          style={{ width: `${percentComplete}%` }}
        />
      </div>
    </header>
  );
}
