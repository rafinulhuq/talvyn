/**
 * Skeleton for /dashboard/jds/[id]/tests — mirrors tests/page.tsx layout.
 * Shows a 3-column grid of test card placeholders.
 */
export default function TestsLoading() {
  return (
    <div className="w-full animate-pulse">
      {/* Back link */}
      <div className="mb-6 h-4 w-36 rounded bg-slate-100" />

      {/* Header row */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded-lg bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-100" />
        </div>
        {/* Generate Tests button */}
        <div className="h-9 w-36 rounded-lg bg-slate-200" />
      </div>

      {/* 3-column test card grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
            {/* Badge row */}
            <div className="flex items-center justify-between">
              <div className="h-5 w-20 rounded-full bg-slate-200" />
              <div className="h-5 w-14 rounded-full bg-slate-200" />
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <div className="h-4 w-36 rounded bg-slate-200" />
              <div className="h-3 w-full rounded bg-slate-200" />
              <div className="h-3 w-3/4 rounded bg-slate-200" />
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 pt-1">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="h-3 w-16 rounded bg-slate-200" />
            </div>

            {/* Action button */}
            <div className="h-8 w-full rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
