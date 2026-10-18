export default function JdResultsLoading() {
  return (
    <div className="w-full animate-pulse">
      <div className="mb-6 h-4 w-20 rounded bg-slate-200" />
      <div className="mb-6 space-y-2">
        <div className="h-7 w-64 rounded-lg bg-slate-200" />
        <div className="h-4 w-40 rounded bg-slate-100" />
      </div>
      <div className="flex flex-col gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 dark:bg-slate-900">
            <div className="h-9 w-9 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-56 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="h-5 w-20 rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 w-28 rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
