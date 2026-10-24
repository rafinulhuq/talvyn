import type { ReactNode } from "react";
import { clsx } from "clsx";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={clsx("mb-6 border-b border-white/8 pb-5", className)}>
      {breadcrumbs && <div className="mb-2 text-xs text-white/70">{breadcrumbs}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:truncate sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1 text-sm text-white/80">{subtitle}</div>
          )}
        </div>
        {actions && <div className="w-full min-w-0 sm:w-auto sm:shrink-0 flex items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

