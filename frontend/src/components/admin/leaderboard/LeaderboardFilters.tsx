"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import type { AIRecommendation, EvaluationLevel } from "@/types/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
} from "@/types/evaluation";

export type SortKey = "rank" | "name" | "date";
export type SortDir = "asc" | "desc";
export type PassFilter = "all" | "pass" | "fail";

/**
 * One selectable value inside a facet dropdown. `count` is contextual — the
 * page computes it against every *other* active filter, so the number shown
 * is the row count you'd actually get by picking this option, not a static
 * total. That's what lets a zero-count option be dimmed instead of hidden:
 * the user can see why a combination is a dead end.
 */
export type FacetOption = {
  value: string;
  label: string;
  sublabel?: string;
  /** Omitted for facets that don't filter rows (sort), which renders no badge. */
  count?: number;
};

const SORT_LABELS: Record<SortKey, string> = {
  rank: "Score",
  name: "Name",
  date: "Date",
};

type LeaderboardFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;

  jdOptions: FacetOption[];
  filterJd: string;
  onFilterJdChange: (value: string) => void;

  // Company / recruiter are superadmin-only — the page passes undefined for
  // everyone else and both chips drop out of the rail entirely.
  companyOptions?: FacetOption[];
  filterCompany?: string;
  onFilterCompanyChange?: (value: string) => void;

  userOptions?: FacetOption[];
  filterUser?: string;
  onFilterUserChange?: (value: string) => void;

  levelOptions: FacetOption[];
  filterLevel: ReadonlySet<EvaluationLevel>;
  onToggleLevel: (value: EvaluationLevel) => void;
  onClearLevel: () => void;

  recOptions: FacetOption[];
  filterRec: ReadonlySet<AIRecommendation>;
  onToggleRec: (value: AIRecommendation) => void;
  onClearRec: () => void;

  filterPass: PassFilter;
  onFilterPassChange: (value: PassFilter) => void;
  outcomeCounts: Record<PassFilter, number>;

  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;

  onClearAll: () => void;
  displayedCount: number;
  totalCount: number;
};

// ─── Facet dropdown ───────────────────────────────────────────
// One chip that opens a popover. Single-select facets close on pick; multi
// stay open so you can build up a set without re-opening each time.

function FacetDropdown({
  label,
  icon,
  options,
  selected,
  multi = false,
  searchable = false,
  align = "left",
  plain = false,
  onToggle,
  onClear,
}: {
  label: string;
  icon?: React.ReactNode;
  options: FacetOption[];
  selected: string[];
  multi?: boolean;
  searchable?: boolean;
  align?: "left" | "right";
  /** No counts, no clear footer — for a chooser like sort that filters nothing. */
  plain?: boolean;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Closing always drops the typed query, so reopening starts clean. Done here
  // rather than in an effect keyed on `open` — resetting state inside an effect
  // costs a second render pass for every open/close.
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Focus is a DOM side-effect, which is what effects are actually for.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const visible = query
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(query.toLowerCase()) ||
          (option.sublabel ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : options;

  // Collapsed chip summarises the selection instead of just naming the facet:
  // "Expert +1" beats "Level" when two levels are on.
  const chosen = options.filter((option) => selected.includes(option.value));
  const chipText =
    chosen.length === 0
      ? label
      : chosen.length === 1
        ? chosen[0].label
        : `${chosen[0].label} +${chosen.length - 1}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={clsx(
          "inline-flex h-9 max-w-[220px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all shadow-xs",
          chosen.length > 0
            ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
            : open
              ? "border-indigo-300 bg-slate-100 text-slate-900 dark:border-indigo-500 dark:bg-slate-800 dark:text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        )}
      >
        {icon}
        {multi && chosen.length > 1 && (
          <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold tabular-nums">
            {chosen.length}
          </span>
        )}
        <span className="truncate">{chipText}</span>
        <ChevronDown
          className={clsx(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={clsx(
            "absolute top-[calc(100%+6px)] z-40 w-72 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {searchable && (
            <div className="border-b border-slate-100 dark:border-slate-800 p-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label}`}
                className="h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1.5">
            {visible.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-400">
                Nothing matches “{query}”
              </p>
            ) : (
              visible.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onToggle(option.value);
                      if (!multi) close();
                    }}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                      option.count === 0 && !isSelected && "opacity-40"
                    )}
                  >
                    <Check
                      className={clsx(
                        "h-3.5 w-3.5 shrink-0",
                        isSelected ? "opacity-100 text-indigo-600 dark:text-indigo-400" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                      {option.sublabel && (
                        <span className="block truncate text-[10px] font-normal text-slate-400">
                          {option.sublabel}
                        </span>
                      )}
                    </span>
                    {option.count !== undefined && (
                      <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-400">
                        [{option.count}]
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {!plain && (
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
              <span className="text-[10px] text-slate-400">
                {multi ? "Multi-select" : "Single select"}
              </span>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  if (!multi) close();
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Active filter chip ───────────────────────────────────────

function ActiveChip({
  facet,
  value,
  onRemove,
}: {
  facet: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/70 dark:border-indigo-800 dark:bg-indigo-950/40 pl-2.5 pr-1.5 text-xs text-indigo-800 dark:text-indigo-200">
      <span className="text-indigo-400 font-medium">{facet}:</span>
      <span className="truncate font-semibold">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${facet} filter ${value}`}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function LeaderboardFilters({
  search,
  onSearchChange,
  jdOptions,
  filterJd,
  onFilterJdChange,
  companyOptions,
  filterCompany,
  onFilterCompanyChange,
  userOptions,
  filterUser,
  onFilterUserChange,
  levelOptions,
  filterLevel,
  onToggleLevel,
  onClearLevel,
  recOptions,
  filterRec,
  onToggleRec,
  onClearRec,
  filterPass,
  onFilterPassChange,
  outcomeCounts,
  sortKey,
  sortDir,
  onSortChange,
  onClearAll,
  displayedCount,
  totalCount,
}: LeaderboardFiltersProps) {
  // The facet chips are compact enough to wrap on a phone, but five of them
  // plus the segmented outcome still crowds a 360px screen — they stay behind
  // a disclosure below `sm`. The active-chip row is deliberately outside it so
  // an applied filter is never hidden.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const showCompany = !!companyOptions?.length && !!onFilterCompanyChange;
  const showUser = !!userOptions?.length && !!onFilterUserChange;

  const activeFilterCount =
    (filterJd !== "all" ? 1 : 0) +
    (filterCompany && filterCompany !== "all" ? 1 : 0) +
    (filterUser && filterUser !== "all" ? 1 : 0) +
    filterRec.size +
    filterLevel.size +
    (filterPass !== "all" ? 1 : 0);

  const companyLabel =
    companyOptions?.find((option) => option.value === filterCompany)?.label ?? "";
  const userLabel = userOptions?.find((option) => option.value === filterUser)?.label ?? "";
  const jdLabel = jdOptions.find((option) => option.value === filterJd)?.label ?? "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 mb-5">
      {/* ── The rail ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[170px] flex-1 sm:max-w-[280px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Name, email, company…"
            aria-label="Search candidates by name, email, company, recruiter or JD"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs text-slate-900 placeholder:text-slate-400 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Mobile disclosure for the facet chips */}
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
          aria-controls="leaderboard-facets"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 sm:hidden dark:border-slate-700 dark:text-slate-200"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] text-white font-bold">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={clsx("h-3.5 w-3.5 transition-transform", filtersOpen && "rotate-180")} />
        </button>

        <div
          id="leaderboard-facets"
          className={clsx(
            "flex-wrap items-center gap-2",
            filtersOpen ? "flex w-full" : "hidden sm:flex"
          )}
        >
          <span className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />

          {showCompany && (
            <FacetDropdown
              label="Company"
              icon={<Building2 className="h-3.5 w-3.5 shrink-0" />}
              options={companyOptions!}
              selected={filterCompany && filterCompany !== "all" ? [filterCompany] : []}
              searchable={companyOptions!.length > 6}
              onToggle={(value) =>
                onFilterCompanyChange!(filterCompany === value ? "all" : value)
              }
              onClear={() => onFilterCompanyChange!("all")}
            />
          )}

          {showUser && (
            <FacetDropdown
              label="Recruiter"
              options={userOptions!}
              selected={filterUser && filterUser !== "all" ? [filterUser] : []}
              searchable={userOptions!.length > 6}
              onToggle={(value) => onFilterUserChange!(filterUser === value ? "all" : value)}
              onClear={() => onFilterUserChange!("all")}
            />
          )}

          {jdOptions.length > 1 && (
            <FacetDropdown
              label="Job"
              options={jdOptions}
              selected={filterJd !== "all" ? [filterJd] : []}
              searchable={jdOptions.length > 6}
              onToggle={(value) => onFilterJdChange(filterJd === value ? "all" : value)}
              onClear={() => onFilterJdChange("all")}
            />
          )}

          <FacetDropdown
            label="Level"
            options={levelOptions}
            selected={[...filterLevel]}
            multi
            onToggle={(value) => onToggleLevel(value as EvaluationLevel)}
            onClear={onClearLevel}
          />

          <FacetDropdown
            label="Recommendation"
            options={recOptions}
            selected={[...filterRec]}
            multi
            onToggle={(value) => onToggleRec(value as AIRecommendation)}
            onClear={onClearRec}
          />

          <span className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />

          {/* Outcome — three fixed choices */}
          <div
            role="group"
            aria-label="Outcome"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-0.5 dark:border-slate-700 dark:bg-slate-800"
          >
            {(["all", "pass", "fail"] as PassFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onFilterPassChange(value)}
                aria-pressed={filterPass === value}
                className={clsx(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
                  filterPass === value
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                )}
              >
                {value === "all" ? "All" : value === "pass" ? "Pass" : "Fail"}
                <span className="text-[10px] tabular-nums opacity-75">[{outcomeCounts[value]}]</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:block">
            Sort
          </span>
          <FacetDropdown
            label={SORT_LABELS[sortKey]}
            align="right"
            plain
            options={(Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({
              value: key,
              label: SORT_LABELS[key],
            }))}
            selected={[sortKey]}
            onToggle={(value) => onSortChange(value as SortKey)}
            onClear={() => undefined}
          />
          {sortDir === "desc" ? (
            <ArrowDown className="h-4 w-4 text-slate-400" aria-label="Descending" />
          ) : (
            <ArrowUp className="h-4 w-4 text-slate-400" aria-label="Ascending" />
          )}
        </div>
      </div>

      {/* ── Active filters ───────────────────────────────────── */}
      {activeFilterCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Filtering by:
          </span>

          {filterCompany && filterCompany !== "all" && (
            <ActiveChip
              facet="Company"
              value={companyLabel || filterCompany}
              onRemove={() => onFilterCompanyChange?.("all")}
            />
          )}
          {filterUser && filterUser !== "all" && (
            <ActiveChip
              facet="Recruiter"
              value={userLabel || filterUser}
              onRemove={() => onFilterUserChange?.("all")}
            />
          )}
          {filterJd !== "all" && (
            <ActiveChip
              facet="Job"
              value={jdLabel || filterJd}
              onRemove={() => onFilterJdChange("all")}
            />
          )}
          {[...filterLevel].map((level) => (
            <ActiveChip
              key={level}
              facet="Level"
              value={EVALUATION_LEVEL_CONFIG[level]?.label ?? level}
              onRemove={() => onToggleLevel(level)}
            />
          ))}
          {[...filterRec].map((rec) => (
            <ActiveChip
              key={rec}
              facet="Rec"
              value={RECOMMENDATION_CONFIG[rec]?.label ?? rec}
              onRemove={() => onToggleRec(rec)}
            />
          ))}
          {filterPass !== "all" && (
            <ActiveChip
              facet="Outcome"
              value={filterPass === "pass" ? "Pass" : "Fail"}
              onRemove={() => onFilterPassChange("all")}
            />
          )}

          <button
            type="button"
            onClick={onClearAll}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
          >
            Clear all
          </button>

          <span className="ml-auto text-xs tabular-nums text-slate-400 font-medium">
            {displayedCount} of {totalCount}
          </span>
        </div>
      )}

      {activeFilterCount === 0 && (
        <p className="mt-2 text-xs tabular-nums text-slate-400">
          {displayedCount} of {totalCount} shown
        </p>
      )}
    </div>
  );
}
