/**
 * SectionProgress — 3-dot indicator showing which exam section (Reasoning /
 * Practical / Technical) is current, done, or upcoming. Master Prompt 2/3.
 */

"use client";

import { clsx } from "clsx";
import { Check } from "lucide-react";
import { SECTION_LABELS, SECTION_ORDER, type SectionType } from "@/types/exam";

interface SectionProgressProps {
  currentSection: SectionType;
  sectionIndex: number; // 1-based
  totalSections: number;
}

export function SectionProgress({ currentSection, sectionIndex }: SectionProgressProps) {
  return (
    <div className="flex items-center gap-2" aria-label="Exam section progress">
      {SECTION_ORDER.map((section, i) => {
        const stepNumber = i + 1;
        const isDone = stepNumber < sectionIndex;
        const isCurrent = section === currentSection;
        return (
          <div key={section} className="flex items-center gap-2">
            <div
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-3 py-1 font-sans text-xs font-semibold tracking-tight transition-all",
                isCurrent
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-500/25 ring-2 ring-indigo-600/20"
                  : isDone
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-400"
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : <span>{stepNumber}</span>}
              <span>{SECTION_LABELS[section]}</span>
            </div>
            {i < SECTION_ORDER.length - 1 && (
              <div className={clsx("h-0.5 w-3 rounded-full", isDone ? "bg-emerald-500" : isCurrent ? "bg-indigo-300" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
