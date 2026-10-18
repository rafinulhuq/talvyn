/**
 * PageSkeleton — the shared scaffold for `loading.tsx` files.
 *
 * A route without a `loading.tsx` has no Suspense boundary, so Next blocks the
 * navigation until the server component's data resolves: the click appears to
 * do nothing, then the whole page swaps. Giving each route a boundary is what
 * makes navigation feel instant — the skeleton is the cheap part, the
 * boundary is the point.
 */

import { Skeleton } from "./Skeleton";

interface PageSkeletonProps {
  /** Rows in the list block. 0 renders the header (and cards) only. */
  rows?: number;
  /** Stat/KPI tiles above the list. 0 renders none. */
  cards?: number;
  /** Width of the placeholder action button in the header; 0 renders none. */
  action?: boolean;
}

export function PageSkeleton({ rows = 5, cards = 0, action = false }: PageSkeletonProps) {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        {action && <Skeleton className="h-9 w-32 shrink-0 rounded-full" />}
      </div>

      {cards > 0 && (
        <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-4 h-7 w-14" />
            </div>
          ))}
        </div>
      )}

      {rows > 0 && (
        <div className="stagger flex flex-col gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl bg-white px-4 py-4 dark:bg-slate-900"
            >
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
