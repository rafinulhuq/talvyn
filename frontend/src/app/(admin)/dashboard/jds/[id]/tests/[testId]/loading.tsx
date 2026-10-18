/**
 * Skeleton for /dashboard/jds/[id]/tests/[testId] — mirrors the TestEditorPanel layout.
 * Shows a question list with expandable answer stubs.
 */
export default function TestDetailLoading() {
  return (
    <div className="w-full animate-pulse">
      {/* Back link */}
      <div className="mb-6 h-4 w-20 rounded bg-slate-100" />

      {/* Test header card */}
      <div className="mb-4 flex items-start justify-between gap-4 rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
        <div className="flex-1 space-y-2">
          <div className="h-6 w-56 rounded-lg bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-200" />
          <div className="h-4 w-3/4 rounded bg-slate-200" />
          {/* Meta badges */}
          <div className="flex gap-2 pt-1">
            <div className="h-5 w-16 rounded-full bg-slate-200" />
            <div className="h-5 w-16 rounded-full bg-slate-200" />
            <div className="h-5 w-20 rounded-full bg-slate-200" />
          </div>
        </div>
        {/* Approve / action buttons */}
        <div className="flex flex-col gap-2">
          <div className="h-8 w-28 rounded-lg bg-slate-200" />
          <div className="h-8 w-28 rounded-lg bg-slate-200" />
        </div>
      </div>

      {/* Question list */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
            {/* Question number */}
            <div className="h-6 w-6 shrink-0 rounded-full bg-slate-200" />
            {/* Type badge */}
            <div className="h-5 w-12 rounded-full bg-slate-200 shrink-0" />
            {/* Question text */}
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-full rounded bg-slate-200" />
              <div className="h-3 w-4/5 rounded bg-slate-200" />
            </div>
            {/* Score */}
            <div className="h-4 w-10 shrink-0 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
