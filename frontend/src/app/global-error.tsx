"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_GLITCHTIP_DSN) {
      Sentry.captureException(error);
    }
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
          <div className="flex max-w-md flex-col items-center gap-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-light">
              <AlertTriangle className="h-6 w-6 text-danger" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">
                Something went wrong
              </p>
              <p className="mt-2 text-sm text-slate-500">
                The page failed unexpectedly. Try again, and if it keeps
                happening, share the error ID with support.
              </p>
              {error.digest && (
                <p className="mt-2 font-mono text-xs text-slate-400">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
            <Button
              onClick={reset}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
