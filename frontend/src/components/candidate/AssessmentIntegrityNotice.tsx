"use client";

import { ShieldAlert } from "lucide-react";

interface Props {
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  warning: string;
}

export function AssessmentIntegrityNotice({
  acknowledged,
  onAcknowledgedChange,
  warning,
}: Props) {
  return (
    <div className="w-full rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 text-left shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-300">
          Assessment Integrity Guidelines
        </p>
      </div>
      <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/90">{warning}</p>
      <label className="mt-3.5 flex items-center gap-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledgedChange(e.target.checked)}
          className="h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
        />
        <span>I understand and agree to these assessment rules</span>
      </label>
    </div>
  );
}
