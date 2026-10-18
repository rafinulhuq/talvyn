import type { ComponentType, ReactNode } from "react";
import { clsx } from "clsx";

export function SettingRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-800/40">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {value}
      </span>
    </div>
  );
}

export function Section({
  icon: Icon,
  title,
  children,
  accent = "brand",
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
  accent?: "brand" | "secondary";
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
        <Icon className={clsx("h-4 w-4 text-indigo-600 dark:text-indigo-400", accent === "secondary" && "text-slate-500")} />
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}
