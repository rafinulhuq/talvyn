import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={clsx(
        "scroll-row flex items-center gap-1.5 overflow-x-auto text-xs text-slate-500 dark:text-zinc-400 sm:text-sm",
        className
      )}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span
            key={item.href ?? item.label}
            className="flex shrink-0 items-center gap-1.5"
          >
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="max-w-[9rem] truncate transition-colors hover:text-slate-900 dark:hover:text-zinc-100 sm:max-w-none"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={clsx(
                  "max-w-[9rem] truncate sm:max-w-none",
                  isLast && "font-medium text-slate-800 dark:text-zinc-200"
                )}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-zinc-600" />
            )}
          </span>
        );
      })}
    </nav>
  );
}
