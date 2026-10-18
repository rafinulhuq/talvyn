import { AlertTriangle, FileSearch, Loader2 } from "lucide-react";
import type { CheckState } from "@/hooks/useAtsCheckerFlow";
import type { ATSCheckResponse } from "@/types/ats";
import { ResultPanel } from "./ResultPanel";

interface Props {
  state: CheckState;
  result: ATSCheckResponse | null;
}

export function AtsReportPanel({ state, result }: Props) {
  return (
    <aside className="flex flex-col">
      {state.phase === "extracting" && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Reading the file
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {state.filename}
            </p>
          </div>
        </div>
      )}

      {state.phase === "checking" && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Running ATS checks…
          </p>
        </div>
      )}

      {state.phase === "error" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-5 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/20">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-300">
                {state.message}
              </p>
              {state.detail && (
                <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">
                  {state.detail}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {state.phase === "done" && result && <ResultPanel result={result} />}

      {state.phase === "idle" && !result && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-600/10 dark:bg-indigo-950/40 dark:text-indigo-400">
            <FileSearch className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            No report yet
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Upload or paste a resume, optionally pick a job description to
            match against, then run the check.
          </p>
        </div>
      )}
    </aside>
  );
}
