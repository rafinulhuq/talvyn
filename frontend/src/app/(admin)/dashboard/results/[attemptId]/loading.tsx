import { Skeleton } from "@/components/ui/Skeleton";

export default function EvaluationReportLoading() {
  return (
    <div className="w-full">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
        <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
