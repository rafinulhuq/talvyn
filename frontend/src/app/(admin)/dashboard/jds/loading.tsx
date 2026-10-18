/**
 * Skeleton for /dashboard/jds — mirrors the exact layout of jds/page.tsx.
 * Shown by Next.js while the server component fetches data (Suspense streaming).
 */
export default function JdsLoading() {
  return (
    <div className="w-full animate-pulse">
      {/* Header row */}
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded-lg bg-slate-200" />
          <div className="h-4 w-24 rounded bg-slate-100" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-200" />
      </div>

      {/* List card */}
      <div className="flex flex-col gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl bg-white px-4 py-4 dark:bg-slate-900">
            {/* File icon */}
            <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-200" />

            {/* Text lines */}
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 rounded bg-slate-200" />
              <div className="h-3 w-32 rounded bg-slate-100" />
            </div>

            {/* Status badge */}
            <div className="h-5 w-16 rounded-full bg-slate-100" />

            {/* Chevron */}
            <div className="h-4 w-4 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
