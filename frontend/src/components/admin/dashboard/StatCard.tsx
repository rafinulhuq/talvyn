/**
 * KPI card for the dashboard stat row.
 * Crisp white surface with subtle border, elevation, and optional trend indicators.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ComponentType } from "react";
import { clsx } from "clsx";

interface StatCardProps {
  label: string;
  value: string | number;
  href?: string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  trend?: string;
}

export function StatCard({ label, value, href, hint, icon: Icon, trend }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
          {value}
        </p>
        {trend && (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            {trend}
          </span>
        )}
        {href && !trend && (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-600" />
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </>
  );

  const cardClasses = clsx(
    "group block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5",
    "shadow-xs transition-all duration-200 ease-out",
    "hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md",
    "active:scale-[0.99]"
  );

  if (href) {
    return (
      <Link href={href} className={cardClasses}>
        {content}
      </Link>
    );
  }
  return <div className={cardClasses}>{content}</div>;
}


