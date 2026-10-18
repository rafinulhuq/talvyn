import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { clsx } from "clsx";

interface ErrorStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title,
  description,
  icon,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-4 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/20 py-14 px-6 text-center backdrop-blur-xs",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400">
        {icon ?? <AlertTriangle className="h-6 w-6" />}
      </div>
      <div className="max-w-md">
        <p className="font-display text-sm font-semibold text-slate-900 dark:text-zinc-50">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
