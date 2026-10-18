import type { ReactNode } from "react";
import { clsx } from "clsx";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-12 text-center sm:py-16 shadow-xs",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 sm:h-14 sm:w-14">
        {icon}
      </div>
      <div className="max-w-md">
        <p className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        {description && (
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

