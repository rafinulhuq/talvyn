import { Skeleton } from "@/components/ui/Skeleton";

export default function LeaderboardLoading() {
  return (
    <div className="w-full">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
            <Skeleton className="mx-auto mb-2 h-4 w-4 rounded" />
            <Skeleton className="mx-auto h-5 w-14" />
            <Skeleton className="mx-auto mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-slate-100 mb-4 p-4 dark:bg-slate-800/60">
        <Skeleton className="h-9 w-full max-w-xl" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 dark:bg-slate-800/60 dark:divide-slate-700/50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="hidden h-5 w-16 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
