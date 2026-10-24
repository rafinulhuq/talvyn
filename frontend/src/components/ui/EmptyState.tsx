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
        "flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/10 bg-[#121317] px-6 py-12 text-center sm:py-16 shadow-xs",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#181A1F] border border-white/5 text-[#F2D74E] sm:h-14 sm:w-14">
        {icon}
      </div>
      <div className="max-w-md">
        <p className="font-display text-base font-semibold text-white">{title}</p>
        {description && (
          <p className="mt-1.5 text-sm text-white/80 leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

