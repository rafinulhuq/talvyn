"use client";

/**
 * Dashboard error boundary — catches all unhandled errors thrown by any
 * server or client component inside /dashboard/*.
 *
 * Next.js App Router renders this automatically when a component throws.
 * The `reset` prop re-runs the route segment — equivalent to a soft refresh.
 *
 * Must be a Client Component ("use client") because it uses React state
 * and the error/reset props are provided by the React error boundary API.
 *
 * Placement: (admin)/dashboard/error.tsx covers every /dashboard/* route.
 * For more granular recovery, add an error.tsx inside a specific segment.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: Props) {
  // Log to the browser console so the dev tools show the full stack trace.
  // In production, replace with your error-reporting SDK (Sentry, etc.).
  useEffect(() => {
    console.error("[dashboard error boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-5 py-24 text-center">
      {/* Icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-light">
        <AlertTriangle className="h-6 w-6 text-danger" />
      </div>

      {/* Message */}
      <div className="max-w-sm">
        <p className="text-base font-semibold text-slate-900">
          Something went wrong
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {error.message
            ? error.message
            : "An unexpected error occurred loading this page."}
        </p>
        {/* digest is the server-side error ID — useful for support tickets */}
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-slate-400">
            Error ID: {error.digest}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={reset}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Try again
        </Button>
        <Link href="/dashboard">
          <Button
            variant="secondary"
            leftIcon={<Home className="h-3.5 w-3.5" />}
          >
            Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
