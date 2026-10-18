import { clsx } from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-md bg-slate-200/80 dark:bg-zinc-800/80",
        className
      )}
    >
      <span aria-hidden className="shimmer absolute inset-0" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stagger flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 p-2 dark:bg-zinc-900/40">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-slate-200/60 dark:border-zinc-800/60 bg-white px-4 py-3.5 dark:bg-zinc-900 shadow-2xs"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}
