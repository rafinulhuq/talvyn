"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  logLabel: string;
}

export function AssessmentErrorBoundary({ error, reset, logLabel }: Props) {
  useEffect(() => {
    console.error(`[${logLabel}]`, error);
  }, [error, logLabel]);

  return (
    <div className="flex flex-col items-center gap-5 py-24 text-center font-sans">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
        <AlertTriangle className="h-6 w-6" />
      </div>

      <div className="max-w-sm">
        <p className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          Something Went Wrong
        </p>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed dark:text-slate-400">
          An unexpected error occurred. Please try reloading the session. If the problem continues, open your invitation link again from your email.
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] font-mono text-slate-400">
            Error ID: {error.digest}
          </p>
        )}
      </div>

      <Button onClick={reset} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
        Reload Session
      </Button>
    </div>
  );
}
