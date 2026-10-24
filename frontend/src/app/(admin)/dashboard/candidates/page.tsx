import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  Plus,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { serverFetch } from "@/lib/api/serverFetch";
import type { CandidateListItem, CandidateListResponse } from "@/types/candidate";

export const metadata: Metadata = { title: "Candidates" };

// Always fetch fresh — candidate status changes as tests are started/submitted.
export const revalidate = 0;

type SearchParams = Promise<{
  page?: string | string[];
  search?: string | string[];
}>;

const PAGE_SIZE = 20;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getCandidates(
  page: number,
  search: string
): Promise<CandidateListResponse | null> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  if (search) params.set("search", search);
  return serverFetch<CandidateListResponse>(`/api/v1/candidates/?${params}`);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "No activity yet";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pageHref(page: number, search: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("search", search);
  return `/dashboard/candidates?${params}`;
}

function completionLabel(candidate: CandidateListItem): string {
  if (candidate.total_attempts === 0) return "No tests started";
  return `${candidate.completed_attempts}/${candidate.total_attempts} completed`;
}

function CandidateRow({ candidate }: { candidate: CandidateListItem }) {
  const initial = candidate.name.charAt(0).toUpperCase();
  const hasAttempts = candidate.total_attempts > 0;

  return (
    <Link
      href={`/dashboard/candidates/${candidate.id}`}
      className="group flex items-center gap-4 rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors duration-200 hover:border-white/15 text-white"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#181A1F] border border-white/5 text-sm font-semibold text-[#F2D74E]">
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-sm font-semibold text-white group-hover:text-[#F2D74E] transition-colors">
            {candidate.name}
          </p>
          <Badge variant="indigo">#{candidate.candidate_number}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0 text-white/60" />
            <span className="truncate">{candidate.email}</span>
          </span>
          {candidate.phone && <span>· {candidate.phone}</span>}
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
          {hasAttempts ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[#4ADE80]" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-white/60" />
          )}
          {completionLabel(candidate)}
        </span>
        <span className="text-[11px] text-white/60">
          Last: {formatDateTime(candidate.last_activity_at)}
        </span>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-white/60 group-hover:text-[#F2D74E] group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

function CandidatesToolbar({
  data,
  search,
  hasSearch,
}: {
  data: CandidateListResponse | null;
  search: string;
  hasSearch: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs font-medium text-white/80">
        {data ? (
          <>
            {data.total} candidate{data.total !== 1 ? "s" : ""}
            {hasSearch && <> · Filter: &quot;{search}&quot;</>}
            {data.total_pages > 1 && <> · Page {data.page} of {data.total_pages}</>}
          </>
        ) : (
          " "
        )}
      </span>

      <form action="/dashboard/candidates" className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="candidates-search" className="sr-only">
            Search candidates
          </label>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60" />
            <input
              id="candidates-search"
              name="search"
              defaultValue={search}
              placeholder="Search by name or email..."
              className="h-9 w-full rounded-lg border border-white/8 bg-[#181A1F] pl-8 pr-3 text-xs text-white placeholder:text-white/40 outline-none focus:border-[#F2D74E] focus:ring-1 focus:ring-[#F2D74E] shadow-xs"
            />
          </div>
        </div>
        <Button type="submit" variant="primary" size="sm">
          Filter
        </Button>
        {hasSearch && (
          <Link
            href="/dashboard/candidates"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-[#181A1F] px-3 text-xs font-semibold text-white shadow-xs hover:bg-white/10 transition-colors"
          >
            Clear
          </Link>
        )}
      </form>
    </div>
  );
}

function CandidatesBody({
  data,
  candidates,
  hasSearch,
}: {
  data: CandidateListResponse | null;
  candidates: CandidateListItem[];
  hasSearch: boolean;
}) {
  if (!data) {
    return (
      <ErrorState
        icon={<UserRound className="h-6 w-6" />}
        title="Candidate directory could not load"
        description="Check the backend candidate endpoint and try again."
      />
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title={hasSearch ? "No matching candidates" : "No candidates yet"}
        description={
          hasSearch
            ? "Try a different name or email."
            : "Invite candidates from a job description or share a public apply link."
        }
        action={
          !hasSearch && (
            <Link href="/dashboard/jds">
              <Button size="sm" leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}>
                Choose a JD
              </Button>
            </Link>
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {candidates.map((candidate) => (
        <CandidateRow key={candidate.id} candidate={candidate} />
      ))}
    </div>
  );
}

function CandidatesPagination({
  data,
  search,
}: {
  data: CandidateListResponse;
  search: string;
}) {
  if (data.total_pages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      {data.page > 1 && (
        <Link
          href={pageHref(data.page - 1, search)}
          className="rounded-lg border border-white/10 bg-[#181A1F] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-white/10 transition-colors"
        >
          Previous
        </Link>
      )}
      <span className="text-xs text-white/80">
        Page {data.page} of {data.total_pages}
      </span>
      {data.page < data.total_pages && (
        <Link
          href={pageHref(data.page + 1, search)}
          className="rounded-lg border border-white/10 bg-[#181A1F] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-white/10 transition-colors"
        >
          Next
        </Link>
      )}
    </div>
  );
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = firstParam(params.search).trim();
  const rawPage = Number.parseInt(firstParam(params.page), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const data = await getCandidates(page, search);
  const candidates = data?.items ?? [];
  const hasSearch = search.length > 0;

  return (
    <div className="w-full">
      <PageHeader
        title="Candidates"
        subtitle="Search every candidate and open one profile to see all tests and results."
        actions={
          <Link href="/dashboard/jds">
            <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
              Invite from JD
            </Button>
          </Link>
        }
      />

      <CandidatesToolbar data={data} search={search} hasSearch={hasSearch} />
      <CandidatesBody data={data} candidates={candidates} hasSearch={hasSearch} />
      {data && <CandidatesPagination data={data} search={search} />}
    </div>
  );
}


