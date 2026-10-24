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
        <span className="text-xs font-medium text-white/80">
          {label}
        </span>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#181A1F] border border-white/5 text-[#F2D74E]">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="font-display text-2xl font-bold tracking-tight text-white tabular-nums">
          {value}
        </p>
        {trend && (
          <span className="inline-flex items-center rounded-full bg-[#4ADE80]/10 border border-[#4ADE80]/30 px-2 py-0.5 text-xs font-semibold text-[#4ADE80]">
            {trend}
          </span>
        )}
        {href && !trend && (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-white/80 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#F2D74E]" />
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-white/70">{hint}</p>}
    </>
  );

  const cardClasses = clsx(
    "group block rounded-xl border border-white/8 bg-[#121317] p-5 text-white",
    "shadow-xs transition-colors duration-200 ease-out",
    "hover:border-white/15 hover:bg-[#181A1F]/70"
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


