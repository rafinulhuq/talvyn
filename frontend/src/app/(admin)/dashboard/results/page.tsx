import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { RECOMMENDATION_CONFIG } from "@/types/evaluation";
import type {
  ResultsInboxResponse,
  ResultsInboxAttemptStatus,
  ResultsInboxItem,
} from "@/types/results";
import type { JobDescriptionListResponse } from "@/types/jd";

export const metadata: Metadata = { title: "Results Inbox" };

// Always fetch fresh — new submissions/evaluations land continuously.
export const revalidate = 0;

const PAGE_SIZE = 20;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface Filters {
  page: number;
  search: string;
  jd_id: string;
  status: string;
  recommendation: string;
  integrity: string;
  date_from: string;
  date_to: string;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function parseFilters(searchParams: SearchParams): Promise<Filters> {
  const params = await searchParams;
  const rawPage = Number.parseInt(firstParam(params.page), 10);
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    search: firstParam(params.search).trim(),
    jd_id: firstParam(params.jd_id).trim(),
    status: firstParam(params.status).trim(),
    recommendation: firstParam(params.recommendation).trim(),
    integrity: firstParam(params.integrity).trim(),
    date_from: firstParam(params.date_from).trim(),
    date_to: firstParam(params.date_to).trim(),
  };
}

function buildQuery(filters: Filters): URLSearchParams {
  const query = new URLSearchParams({
    page: String(filters.page),
    page_size: String(PAGE_SIZE),
  });
  if (filters.search) query.set("search", filters.search);
  if (filters.jd_id) query.set("jd_id", filters.jd_id);
  if (filters.status) query.set("status", filters.status);
  if (filters.recommendation) query.set("recommendation", filters.recommendation);
  if (filters.integrity) query.set("integrity", filters.integrity);
  if (filters.date_from) query.set("date_from", filters.date_from);
  if (filters.date_to) query.set("date_to", filters.date_to);
  return query;
}

function pageHref(page: number, filters: Filters): string {
  const query = buildQuery({ ...filters, page });
  return `/dashboard/results?${query}`;
}

async function getInbox(filters: Filters): Promise<ResultsInboxResponse | null> {
  return serverFetch<ResultsInboxResponse>(`/api/v1/evaluation/inbox?${buildQuery(filters)}`);
}

async function getJds(): Promise<JobDescriptionListResponse | null> {
  return serverFetch<JobDescriptionListResponse>("/api/v1/jd/?page=1&page_size=100");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_CONFIG: Record<
  ResultsInboxAttemptStatus,
  { label: string; variant: "yellow" | "green" | "red" }
> = {
  SUBMITTED: { label: "Needs evaluation", variant: "yellow" },
  EVALUATED: { label: "Evaluated", variant: "green" },
  TERMINATED: { label: "Terminated", variant: "red" },
};

const RECOMMENDATION_VARIANT: Record<string, "green" | "yellow" | "red"> = {
  STRONG_HIRE: "green",
  HIRE: "green",
  MAYBE: "yellow",
  NO_HIRE: "red",
};

function ResultsFilterToolbar({
  filters,
  jds,
  hasFilters,
}: {
  filters: Filters;
  jds: JobDescriptionListResponse | null;
  hasFilters: boolean;
}) {
  return (
    <form
      action="/dashboard/results"
      className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
        <label htmlFor="results-search" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Search
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            id="results-search"
            name="search"
            defaultValue={filters.search}
            placeholder="Candidate, email, number"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Job</label>
        <select
          name="jd_id"
          aria-label="Filter by job description"
          defaultValue={filters.jd_id}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All job descriptions</option>
          {jds?.items.map((jd) => (
            <option key={jd.id} value={jd.id}>
              {jd.job_title ?? jd.original_filename}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</label>
        <select
          name="status"
          aria-label="Filter by status"
          defaultValue={filters.status}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All statuses</option>
          <option value="SUBMITTED">Needs evaluation</option>
          <option value="EVALUATED">Evaluated</option>
          <option value="TERMINATED">Terminated</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Verdict</label>
        <select
          name="recommendation"
          aria-label="Filter by recommendation"
          defaultValue={filters.recommendation}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All recommendations</option>
          <option value="STRONG_HIRE">Strong Hire</option>
          <option value="HIRE">Hire</option>
          <option value="MAYBE">Maybe</option>
          <option value="NO_HIRE">No Hire</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Integrity</label>
        <select
          name="integrity"
          aria-label="Filter by integrity status"
          defaultValue={filters.integrity}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Any integrity status</option>
          <option value="clean">Clean</option>
          <option value="violation">Violation</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="results-date-from" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">From</label>
        <input
          id="results-date-from"
          type="date"
          name="date_from"
          defaultValue={filters.date_from}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="results-date-to" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">To</label>
        <input
          id="results-date-to"
          type="date"
          name="date_to"
          defaultValue={filters.date_to}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit" variant="primary" size="sm" className="flex-1">
          Apply filters
        </Button>
        {hasFilters && (
          <Link
            href="/dashboard/results"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
          >
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

function ResultsTableRow({ item }: { item: ResultsInboxItem }) {
  const statusCfg = STATUS_CONFIG[item.attempt_status];
  const recCfg = item.recommendation ? RECOMMENDATION_CONFIG[item.recommendation] : null;
  const isViolation = item.attempt_status === "TERMINATED";

  return (
    <tr className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 text-xs border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td className="px-4 py-3.5">
        <p className="font-semibold text-slate-900 dark:text-white">{item.candidate_name}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          #{item.candidate_number} · {item.candidate_email}
        </p>
      </td>
      <td className="max-w-[160px] truncate px-4 py-3.5 text-slate-800 dark:text-slate-200 font-medium">
        {item.jd_title}
      </td>
      <td className="max-w-[140px] truncate px-4 py-3.5 text-slate-500 font-medium">
        {item.test_title}
      </td>
      <td className="px-4 py-3.5">
        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
      </td>
      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white tabular-nums">
        {item.percentage !== null ? `${Math.round(item.percentage)}%` : "—"}
      </td>
      <td className="px-4 py-3.5">
        {recCfg && item.recommendation ? (
          <Badge variant={RECOMMENDATION_VARIANT[item.recommendation]}>{recCfg.label}</Badge>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {isViolation ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 uppercase"
            title={item.integrity_violation_reason ?? undefined}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Violation
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Clean
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-xs text-slate-400 font-medium">
        {formatDate(item.submitted_at ?? item.terminated_at)}
      </td>
      <td className="px-4 py-3.5 text-right">
        <Link
          href={`/dashboard/results/${item.attempt_id}`}
          className="inline-block rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold shadow-xs hover:bg-indigo-700 transition-colors"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

function ResultsTable({ items }: { items: ResultsInboxItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500 text-[11px] uppercase tracking-wider font-semibold dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Candidate</th>
            <th className="px-4 py-3">Job</th>
            <th className="px-4 py-3">Test</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Verdict</th>
            <th className="px-4 py-3">Integrity</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <ResultsTableRow key={item.attempt_id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function computeHasFilters(filters: Filters): boolean {
  return Boolean(
    filters.search ||
      filters.jd_id ||
      filters.status ||
      filters.recommendation ||
      filters.integrity ||
      filters.date_from ||
      filters.date_to
  );
}

function ResultsBody({ data, hasFilters }: { data: ResultsInboxResponse | null; hasFilters: boolean }) {
  if (!data) {
    return (
      <ErrorState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Results inbox could not load"
        description="Check the backend evaluation endpoint and try again."
      />
    );
  }
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-6 w-6" />}
        title={hasFilters ? "No attempts match your filters" : "No results yet"}
        description={
          hasFilters
            ? "Try clearing a filter or widening the date range."
            : "Results appear here once candidates submit their assessments."
        }
      />
    );
  }
  return <ResultsTable items={data.items} />;
}

function ResultsPagination({ data, filters }: { data: ResultsInboxResponse; filters: Filters }) {
  if (data.total_pages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      {data.page > 1 && (
        <Link
          href={pageHref(data.page - 1, filters)}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          Previous
        </Link>
      )}
      <span className="text-xs font-medium text-slate-500">
        Page {data.page} of {data.total_pages}
      </span>
      {data.page < data.total_pages && (
        <Link
          href={pageHref(data.page + 1, filters)}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          Next
        </Link>
      )}
    </div>
  );
}

export default async function ResultsInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = await parseFilters(searchParams);
  const [data, jds] = await Promise.all([getInbox(filters), getJds()]);
  const hasFilters = computeHasFilters(filters);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Results Inbox"
        subtitle={
          data
            ? `${data.total} attempt${data.total !== 1 ? "s" : ""} across all job descriptions`
            : "—"
        }
        actions={
          <Link href="/dashboard/results/by-jd">
            <Button variant="secondary" size="sm">
              Browse by Job
            </Button>
          </Link>
        }
      />

      <ResultsFilterToolbar filters={filters} jds={jds} hasFilters={hasFilters} />

      <ResultsBody data={data} hasFilters={hasFilters} />

      {data && <ResultsPagination data={data} filters={filters} />}
    </div>
  );
}
