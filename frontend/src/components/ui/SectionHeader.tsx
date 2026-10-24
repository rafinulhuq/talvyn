import type { ReactNode } from "react";
import { clsx } from "clsx";

interface SectionHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={clsx(
        "mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-3",
        className
      )}
    >
      <div>
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#F2D74E]" />
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-white/80">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

