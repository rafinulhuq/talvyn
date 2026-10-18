import { clsx } from "clsx";

export function fieldClasses(extra?: string): string {
  return clsx(
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800",
    "outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100",
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
    extra
  );
}
