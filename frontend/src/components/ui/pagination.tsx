import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** Server-rendered pager: plain links, so pages are shareable and work without JS. */
export function Pagination({ page, totalPages, total, pageSize, href }: { page: number; totalPages: number; total: number; pageSize: number; href: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-8 items-center gap-1 rounded-control border border-line-strong bg-surface px-2.5 text-sm text-ink hover:bg-sunken";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={btn} href={href(page - 1)} rel="prev">
            <ChevronLeft aria-hidden className="size-4" /> Previous
          </Link>
        ) : (
          <span aria-disabled className={cn(btn, "pointer-events-none opacity-50")}>
            <ChevronLeft aria-hidden className="size-4" /> Previous
          </span>
        )}
        {page < totalPages ? (
          <Link className={btn} href={href(page + 1)} rel="next">
            Next <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span aria-disabled className={cn(btn, "pointer-events-none opacity-50")}>
            Next <ChevronRight aria-hidden className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}

/** Reads a 1-based page number from a search param; anything odd becomes 1. */
export const pageParam = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
};
