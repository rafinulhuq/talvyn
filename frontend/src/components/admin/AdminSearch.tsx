"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart2,
  ClipboardList,
  FileText,
  Loader2,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { searchApi } from "@/lib/api/search";
import type { SearchResult } from "@/types/search";

function iconFor(kind: string) {
  if (kind === "candidate") return <UserRound className="h-3.5 w-3.5 text-[#F2D74E]" />;
  if (kind === "jd") return <FileText className="h-3.5 w-3.5 text-[#F2D74E]" />;
  if (kind === "test") return <ClipboardList className="h-3.5 w-3.5 text-[#F2D74E]" />;
  if (kind === "result") return <BarChart2 className="h-3.5 w-3.5 text-[#F2D74E]" />;
  return <Search className="h-3.5 w-3.5 text-white/80" />;
}

function labelFor(kind: string): string {
  if (kind === "jd") return "Job";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function SearchResultsPanel({
  resultsId,
  error,
  loading,
  items,
  onSelect,
}: {
  resultsId: string;
  error: string | null;
  loading: boolean;
  items: SearchResult[];
  onSelect: () => void;
}) {
  return (
    <div
      id={resultsId}
      role="region"
      aria-label="Search results"
      className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-white/10 bg-[#121317] text-white shadow-2xl animate-fade-in motion-reduce:animate-none"
    >
      {error && (
        <div className="px-4 py-3 text-sm text-[#F87171]">{error}</div>
      )}
      {!error && !loading && items.length === 0 && (
        <div className="px-4 py-8 text-center">
          <Search className="mx-auto h-7 w-7 text-white/70" />
          <p className="mt-2 text-sm font-medium text-white">No matches</p>
          <p className="mt-0.5 text-xs text-white/80">
            Try a candidate name, email, job title, test, or candidate number.
          </p>
        </div>
      )}
      {!error && items.length > 0 && (
        <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
          {items.map((item) => (
            <Link
              key={`${item.kind}-${item.href}`}
              href={item.href}
              onClick={onSelect}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#181A1F]"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#181A1F] border border-white/5">
                {iconFor(item.kind)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-white">
                    {item.title}
                  </p>
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                    {labelFor(item.kind)}
                  </span>
                </div>
                {item.subtitle && (
                  <p className="mt-0.5 truncate text-xs text-white/80">
                    {item.subtitle}
                  </p>
                )}
                {item.meta && (
                  <p className="mt-0.5 text-[10px] text-white/70">
                    {item.meta}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminSearch() {
  const resultsId = useId();
  const statusId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setItems([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await searchApi.global(trimmed);
        if (result.success) {
          setItems(result.data.items);
          setOpen(true);
        } else {
          setItems([]);
          setError("Search failed.");
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent | KeyboardEvent) {
      if ("key" in event && event.key !== "Escape") return;
      if ("key" in event) {
        setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnOutsideClick);
    };
  }, []);

  const hasQuery = query.trim().length >= 2;

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80" />
        <input
          value={query}
          type="search"
          role="searchbox"
          aria-label="Search candidates, jobs, tests, and results"
          aria-describedby={statusId}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => hasQuery && setOpen(true)}
          placeholder="Search candidates, jobs, tests, results..."
          className="h-9 w-full rounded-lg border border-white/8 bg-[#181A1F] pl-9 pr-9 text-sm text-white placeholder-white/40 outline-none transition focus:border-[#F2D74E] focus:ring-1 focus:ring-[#F2D74E]"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/80" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setItems([]);
              setOpen(false);
              setError(null);
            }}
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && hasQuery && (
        <SearchResultsPanel
          resultsId={resultsId}
          error={error}
          loading={loading}
          items={items}
          onSelect={() => setOpen(false)}
        />
      )}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Searching"
          : error
            ? "Search failed"
            : hasQuery
              ? `${items.length} search result${items.length === 1 ? "" : "s"}`
              : ""}
      </p>
    </div>
  );
}
