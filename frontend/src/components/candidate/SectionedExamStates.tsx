"use client";

import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SectionLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
    </div>
  );
}

export function SectionedExamErrorState({
  loadError,
  onReload,
}: {
  loadError: string | null;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center font-sans">
      <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm ring-1 ring-slate-900/5 flex flex-col items-center gap-4 max-w-sm w-full dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div>
          <p className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white">We Hit a Snag</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{loadError}</p>
        </div>
        <Button onClick={onReload} variant="secondary" size="sm" className="w-full">
          Reload Session
        </Button>
      </div>
    </div>
  );
}
