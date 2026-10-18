"use client";

import { Loader2, AlertCircle, ShieldAlert, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

const breadcrumbItems = [{ label: "Results", href: "/dashboard/results" }, { label: "Evaluation" }];

export function EvaluationLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Loading evaluation...</span>
    </div>
  );
}

export function EvaluationTerminatedState() {
  return (
    <div className="w-full">
      <Breadcrumbs items={breadcrumbItems} className="mb-6" />
      <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white py-12 px-6 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div>
          <p className="text-base font-bold text-slate-900 dark:text-white">Terminated — Not Evaluated</p>
          <p className="mt-1.5 max-w-md text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            This candidate triggered an integrity violation. Review the event
            timeline before making a decision.
          </p>
        </div>
      </div>
    </div>
  );
}

export function EvaluationPendingState({
  triggering,
  error,
  onTrigger,
}: {
  triggering: boolean;
  error: string | null;
  onTrigger: () => void;
}) {
  return (
    <div className="w-full">
      <Breadcrumbs items={breadcrumbItems} className="mb-6" />
      <div className="flex flex-col items-center gap-5 rounded-xl border border-slate-200 bg-white py-12 px-6 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
          <Wand2 className="h-7 w-7" />
        </div>
        <div>
          <p className="text-base font-bold text-slate-900 dark:text-white">No Evaluation Generated Yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Click below to run AI evaluation for this candidate test attempt.
          </p>
        </div>
        <Button
          onClick={onTrigger}
          loading={triggering}
          leftIcon={<Wand2 className="h-4 w-4" />}
          variant="primary"
        >
          {triggering ? "Evaluating…" : "Run Evaluation"}
        </Button>
        {triggering && (
          <p className="text-xs text-slate-400">
            This usually takes 1–3 minutes, but can run longer during heavy load —
            this page will update on its own once it&apos;s done.
          </p>
        )}
        {error && error !== "not_found" && (
          <p className="text-xs font-semibold text-rose-600">{error}</p>
        )}
      </div>
    </div>
  );
}

export function EvaluationLoadErrorState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="w-full">
      <Breadcrumbs items={breadcrumbItems} className="mb-6" />
      <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white py-12 px-6 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <AlertCircle className="h-8 w-8 text-rose-600" />
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{error}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    </div>
  );
}
