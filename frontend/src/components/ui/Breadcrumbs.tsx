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
        "scroll-row flex items-center gap-1.5 overflow-x-auto text-xs text-white/70 sm:text-sm",
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
                className="max-w-[9rem] truncate transition-colors hover:text-[#F2D74E] sm:max-w-none text-white/80"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={clsx(
                  "max-w-[9rem] truncate sm:max-w-none",
                  isLast && "font-semibold text-white"
                )}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
            )}
          </span>
        );
      })}
    </nav>
  );
}
