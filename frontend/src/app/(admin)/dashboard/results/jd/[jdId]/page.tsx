import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  BarChart2,
  ClipboardList,
  Clock,
  Users,
  Trophy,
  FileText,
} from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { InvitationStatusBadge } from "@/components/admin/InvitationStatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import type { JobDescription } from "@/types/jd";
import type { InvitationListResponse, Invitation } from "@/types/invitation";

export const revalidate = 0;

export const metadata: Metadata = { title: "Candidate Results" };

async function getJd(jdId: string): Promise<JobDescription | null> {
  return serverFetch<JobDescription>(`/api/v1/jd/${jdId}`);
}

async function getInvitations(jdId: string): Promise<InvitationListResponse | null> {
  return serverFetch<InvitationListResponse>(
    `/api/v1/invitations/jd/${jdId}?page=1&page_size=100`
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CandidateRowStatusAction({ inv }: { inv: Invitation }) {
  if (inv.status === "COMPLETED" && inv.attempt_id) {
    return (
      <Link
        href={`/dashboard/results/${inv.attempt_id}`}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
      >
        <BarChart2 className="h-3.5 w-3.5 text-success" />
        View Results
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
      </Link>
    );
  }

  if (inv.status === "COMPLETED") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <BarChart2 className="h-3.5 w-3.5" />
        No attempt data
      </span>
    );
  }

  let label = "Revoked";
  if (inv.status === "PENDING" || inv.status === "OPENED") {
    label = "Awaiting submission";
  } else if (inv.status === "EXPIRED") {
    label = "Link expired";
  }

  return (
    <div className="flex items-center gap-1 text-xs text-slate-400">
      <Clock className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function CandidateRow({ inv }: { inv: Invitation }) {
  const initial = (inv.candidate_name ?? "?").charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 dark:bg-slate-900">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        <Link
          href={`/dashboard/candidates/${inv.candidate_id}`}
          className="block truncate text-sm font-medium text-slate-900 transition-colors hover:text-brand-800 dark:text-slate-50"
          aria-label={`Open profile for ${inv.candidate_name ?? inv.candidate_email ?? "candidate"}`}
        >
          {inv.candidate_name ?? "Unknown"}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          {inv.candidate_number && (
            <span className="font-medium text-slate-600 dark:text-slate-300">
              Candidate #{inv.candidate_number}
            </span>
          )}
          <span className="truncate">{inv.candidate_email}</span>
        </div>
      </div>

      <div className="hidden sm:block shrink-0">
        <InvitationStatusBadge
          status={inv.status}
          flaggedDuplicateDevice={inv.flagged_duplicate_device}
          flaggedDuplicateReason={inv.flagged_duplicate_reason}
        />
      </div>

      <div className="hidden md:block shrink-0 text-xs text-slate-400">
        {formatDate(inv.created_at)}
      </div>

      <div className="shrink-0">
        <CandidateRowStatusAction inv={inv} />
      </div>
    </div>
  );
}

// Plain functions, not JSX components: PageHeader does `{subtitle && ...}`
// and `{actions && ...}`, so these must return the real ReactNode | undefined
// / ReactNode | false — a <Component/> element is always truthy and would
// make PageHeader render an empty wrapper even when there's nothing to show.
function renderJdResultsSubtitle({
  seniorityLevel,
  itemCount,
  completedCount,
}: {
  seniorityLevel: string | null | undefined;
  itemCount: number;
  completedCount: number;
}) {
  if (!seniorityLevel && itemCount === 0) return undefined;

  return (
    <>
      {seniorityLevel}
      {seniorityLevel && itemCount > 0 && " · "}
      {itemCount > 0 && (
        <>
          {itemCount} candidate{itemCount !== 1 ? "s" : ""} invited
          {completedCount > 0 && (
            <> · <span className="text-success font-medium">{completedCount} completed</span></>
          )}
        </>
      )}
    </>
  );
}

function renderJdResultsActions({ jdId, completedCount }: { jdId: string; completedCount: number }) {
  return (
    completedCount > 0 && (
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/dashboard/results/leaderboard/${jdId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <Trophy className="h-3.5 w-3.5" />
          Leaderboard
        </Link>
        <Link
          href={`/dashboard/results/report/${jdId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          System Report
        </Link>
      </div>
    )
  );
}

function JdResultsBody({
  jdId,
  items,
  completedCount,
}: {
  jdId: string;
  items: Invitation[];
  completedCount: number;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="No candidates invited yet"
        description="Invite candidates from the Candidates tab to see results here."
        action={
          <Link
            href={`/dashboard/jds/${jdId}/invite`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-brand-700 transition-colors"
          >
            Invite Candidates
          </Link>
        }
      />
    );
  }

  if (completedCount === 0) {
    return (
      <div className="mb-4 rounded-2xl bg-slate-100 px-5 py-4 dark:bg-slate-800/60">
        <div className="flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No submissions yet</p>
            <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
              Results will appear here once candidates complete their assessments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stagger flex flex-col gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
      {items.map((inv) => (
        <CandidateRow key={inv.id} inv={inv} />
      ))}
    </div>
  );
}

export default async function JdResultsPage({
  params,
}: {
  params: Promise<{ jdId: string }>;
}) {
  const { jdId } = await params;
  const [jd, invitations] = await Promise.all([getJd(jdId), getInvitations(jdId)]);

  const jdTitle =
    jd?.extracted_data?.job_title ?? jd?.original_filename ?? "Job Description";

  const items = invitations?.items ?? [];
  const completedCount = items.filter((i) => i.status === "COMPLETED").length;

  return (
    <div className="w-full">
      <PageHeader
        title={jdTitle}
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Results", href: "/dashboard/results" }, { label: jdTitle }]} />
        }
        subtitle={renderJdResultsSubtitle({
          seniorityLevel: jd?.extracted_data?.seniority_level,
          itemCount: items.length,
          completedCount,
        })}
        actions={renderJdResultsActions({ jdId, completedCount })}
      />

      <JdResultsBody jdId={jdId} items={items} completedCount={completedCount} />
    </div>
  );
}
