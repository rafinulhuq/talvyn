/**
 * Skeleton for /dashboard/results — mirrors the Results Inbox filter
 * toolbar + table shape in page.tsx.
 */

import { Skeleton } from "@/components/ui/Skeleton";

export default function ResultsInboxLoading() {
  return (
    <div className="w-full">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Filter toolbar */}
      <div className="mb-4 grid gap-3 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
        <div className="rounded-xl bg-white dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-44" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
