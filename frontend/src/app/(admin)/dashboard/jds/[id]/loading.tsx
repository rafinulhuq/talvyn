/**
 * Skeleton for /dashboard/jds/[id] — mirrors jds/[id]/page.tsx layout.
 * The JD detail page loads a large payload (raw_text + extracted_data),
 * so the skeleton covers the full structure: header, analysis section, action cards.
 */
export default function JdDetailLoading() {
  return (
    <div className="w-full animate-pulse">
      {/* Back link */}
      <div className="mb-6 h-4 w-32 rounded bg-slate-100" />

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-7 w-72 rounded-lg bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 rounded-full bg-slate-100" />
            <div className="h-4 w-20 rounded bg-slate-100" />
            <div className="h-4 w-28 rounded bg-slate-100" />
          </div>
        </div>
        {/* Analyze button */}
        <div className="h-9 w-28 shrink-0 rounded-lg bg-slate-200" />
      </div>

      {/* Skills section heading */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-48 rounded bg-slate-200" />
        <div className="h-4 w-32 rounded bg-slate-100" />
      </div>

      {/* Skills panels grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
            <div className="h-4 w-28 rounded bg-slate-200" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-5 w-20 rounded-full bg-slate-200 inline-block mr-2" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Next-step action cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="h-3 w-44 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
