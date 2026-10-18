"use client";

import Link from "next/link";
import type { ExamTemplate } from "@/types/exam";

export const DEFAULT_PRESET = "default";
export const FAST_PRESET = "fast";

type GenerationPresetSelectProps = {
  preset: string;
  disabled: boolean;
  templates: ExamTemplate[];
  onChange: (preset: string) => void;
};

export function GenerationPresetSelect({ preset, disabled, templates, onChange }: GenerationPresetSelectProps) {
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <label htmlFor="bank-preset" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        Generation preset — applies to generate and regenerate below
      </label>
      <select
        id="bank-preset"
        value={preset}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <option value={DEFAULT_PRESET}>Commercial default (40 MCQ / 20 CQ per section)</option>
        <option value={FAST_PRESET}>Fast / minimum (20 MCQ / 10 CQ) — quicker, still assignable</option>
        {templates.length > 0 && (
          <optgroup label="Saved templates">
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Manage saved presets under{" "}
        <Link href="/dashboard/templates" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          Templates
        </Link>
        .
      </p>
    </div>
  );
}
