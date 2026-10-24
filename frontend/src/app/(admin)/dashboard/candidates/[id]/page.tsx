import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  BarChart2,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Hash,
  LinkIcon,
  Mail,
  Phone,
  ShieldX,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { InvitationStatusBadge } from "@/components/admin/InvitationStatusBadge";
import { DeleteCandidateButton } from "@/components/admin/DeleteCandidateButton";
import { serverFetch } from "@/lib/api/serverFetch";
import type {
  CandidateAttemptItem,
  CandidateAttemptsResponse,
  CandidateProfileResponse,
} from "@/types/candidate";
import { RECOMMENDATION_CONFIG } from "@/types/evaluation";

export const revalidate = 0;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const candidate = await getCandidate(id);
  return {
    title: candidate
      ? `Candidate #${candidate.candidate_number} - ${candidate.name}`
      : "Candidate Profile",
  };
}

async function getCandidate(id: string): Promise<CandidateProfileResponse | null> {
  return serverFetch<CandidateProfileResponse>(`/api/v1/candidates/${id}`);
}

async function getAttempts(id: string): Promise<CandidateAttemptsResponse | null> {
  return serverFetch<CandidateAttemptsResponse>(`/api/v1/candidates/${id}/attempts`);
}

function formatDate(iso: string | null): string {
  if (!iso) return "Not started";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Not started";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleCaseStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function attemptVariant(status: string): "blue" | "green" | "yellow" | "slate" | "red" {
  if (status === "EVALUATED") return "green";
  if (status === "SUBMITTED") return "blue";
  if (status === "IN_PROGRESS") return "yellow";
  if (status === "TERMINATED") return "red";
  return "slate";
}

function scoreText(attempt: CandidateAttemptItem): string {
  if (attempt.percentage === null || attempt.total_score === null || attempt.max_score === null) {
    return "No score yet";
  }
  return `${Math.round(attempt.percentage)}% (${attempt.total_score}/${attempt.max_score})`;
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#121317] p-4 text-white">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#181A1F] border border-white/5 text-[#F2D74E]">
        {icon}
      </div>
      <p className="font-display text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-xs font-medium text-white/80">{label}</p>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/8 bg-[#181A1F] px-3 py-2.5">
      <div className="text-white/80">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/70">
          {label}
        </p>
        {value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-[#F2D74E] hover:underline"
            >
              <span className="truncate">{value}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <p className="truncate text-xs font-medium text-white">{value}</p>
          )
        ) : (
          <p className="text-xs text-white/70">Not provided</p>
        )}
      </div>
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: CandidateAttemptItem }) {
  const effectiveRecommendation =
    attempt.admin_override_recommendation ?? attempt.ai_recommendation;
  const recommendationConfig = effectiveRecommendation
    ? RECOMMENDATION_CONFIG[effectiveRecommendation]
    : null;
  const canOpenResult =
    attempt.attempt_status === "SUBMITTED" || attempt.attempt_status === "EVALUATED";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/8 bg-[#121317] px-5 py-4 text-white transition-colors hover:border-white/16 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 gap-3.5">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#181A1F] border border-white/5 text-[#F2D74E]">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-sm font-semibold text-white">
              {attempt.test_title}
            </p>
            <Badge variant={attemptVariant(attempt.attempt_status)}>
              {titleCaseStatus(attempt.attempt_status)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
            <Link
              href={`/dashboard/jds/${attempt.jd_id}`}
              className="inline-flex min-w-0 items-center gap-1 font-medium text-white hover:text-[#F2D74E] transition-colors"
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0 text-white/80" />
              <span className="truncate">{attempt.jd_title}</span>
            </Link>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 text-white/80" />
              Started {formatDate(attempt.started_at)}
            </span>
            {attempt.submitted_at && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#4ADE80]" />
                Submitted {formatDate(attempt.submitted_at)}
              </span>
            )}
          </div>
          {attempt.attempt_status === "TERMINATED" && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-[#F87171]/20 bg-[#F87171]/10 px-2.5 py-1.5 text-[#F87171]">
              <ShieldX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F87171]" />
              <p className="text-xs font-medium">
                Integrity violation
                {attempt.integrity_violation_reason &&
                  ` (${titleCaseStatus(attempt.integrity_violation_reason)})`}
                {attempt.terminated_at && ` — ${formatDate(attempt.terminated_at)}`}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <div className="rounded-lg border border-white/8 bg-[#181A1F] px-3 py-1.5 text-right">
          <p className="font-display text-xs font-bold text-white">{scoreText(attempt)}</p>
          <p className="text-[10px] font-medium uppercase text-white/80">Score</p>
        </div>
        {recommendationConfig && (
          <Badge
            variant={
              effectiveRecommendation === "NO_HIRE"
                ? "red"
                : effectiveRecommendation === "MAYBE"
                ? "yellow"
                : "green"
            }
          >
            {recommendationConfig.label}
          </Badge>
        )}
        <InvitationStatusBadge status={attempt.invitation_status} />
        {canOpenResult && (
          <Link
            href={`/dashboard/results/${attempt.attempt_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181A1F] px-3 py-1.5 text-xs font-semibold text-white hover:border-white/20 hover:text-[#F2D74E] transition-colors"
          >
            <BarChart2 className="h-3.5 w-3.5 text-[#F2D74E]" />
            {attempt.has_evaluation ? "Open report" : "Run evaluation"}
            <ChevronRight className="h-3.5 w-3.5 text-white/80" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default async function CandidateProfilePage({ params }: Props) {
  const { id } = await params;
  const [candidate, attemptsResponse] = await Promise.all([
    getCandidate(id),
    getAttempts(id),
  ]);

  if (!candidate) notFound();

  const attempts = attemptsResponse?.items ?? [];
  const inProgressCount = attempts.filter((a) => a.attempt_status === "IN_PROGRESS").length;
  const evaluatedCount = attempts.filter((a) => a.has_evaluation).length;

  return (
    <div className="w-full">
      <Breadcrumbs
        items={[{ label: "Candidates", href: "/dashboard/candidates" }, { label: candidate.name }]}
        className="mb-6"
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#181A1F] border border-[#F2D74E]/30 text-2xl font-bold text-[#F2D74E]">
            {candidate.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight text-white">
                {candidate.name}
              </h1>
              <Badge variant="indigo">Candidate #{candidate.candidate_number}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                <Hash className="h-3.5 w-3.5 text-white/70" />
                {candidate.id}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-white/70" />
                Created {formatDateTime(candidate.created_at)}
              </span>
            </div>
          </div>
        </div>
        <DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.name} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Mail className="h-4 w-4" />}
          label="Invitations"
          value={candidate.total_invitations}
        />
        <StatCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Tests started"
          value={candidate.total_attempts}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Completed tests"
          value={candidate.completed_attempts}
        />
        <StatCard
          icon={<Award className="h-4 w-4" />}
          label="Evaluated reports"
          value={evaluatedCount}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border border-white/8 bg-[#121317] p-5 text-white">
          <div className="mb-4 flex items-center gap-2 border-b border-white/8 pb-2.5">
            <UserRound className="h-4 w-4 text-[#F2D74E]" />
            <h2 className="font-display text-sm font-semibold text-white">
              Profile Information
            </h2>
          </div>
          <div className="space-y-3">
            <ContactRow
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              value={candidate.email}
              href={`mailto:${candidate.email}`}
            />
            <ContactRow
              icon={<Phone className="h-4 w-4" />}
              label="Phone"
              value={candidate.phone}
              href={candidate.phone ? `tel:${candidate.phone}` : undefined}
            />
            <ContactRow
              icon={<LinkIcon className="h-4 w-4" />}
              label="LinkedIn"
              value={candidate.linkedin_url}
              href={candidate.linkedin_url ?? undefined}
            />
            <ContactRow
              icon={<FileText className="h-4 w-4" />}
              label="Resume"
              value={candidate.resume_url}
              href={candidate.resume_url ?? undefined}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#121317] p-5 text-white">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-2.5">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#F2D74E]" />
                <h2 className="font-display text-sm font-semibold text-white">
                  Test Summary
                </h2>
              </div>
              <p className="mt-1 text-xs text-white/80">
                Candidate assessment history across every job description and invitation.
              </p>
            </div>
            {inProgressCount > 0 && (
              <Badge variant="yellow">
                {inProgressCount} in progress
              </Badge>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/8 bg-[#181A1F] p-4">
              <p className="font-display text-2xl font-bold tracking-tight text-white">
                {candidate.total_attempts}
              </p>
              <p className="text-xs text-white/80">Total tests</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-[#181A1F] p-4">
              <p className="font-display text-2xl font-bold tracking-tight text-white">
                {candidate.completed_attempts}
              </p>
              <p className="text-xs text-white/80">Submitted</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-[#181A1F] p-4">
              <p className="font-display text-2xl font-bold tracking-tight text-white">
                {evaluatedCount}
              </p>
              <p className="text-xs text-white/80">Evaluated</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/8 pb-2.5">
        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            Tests and Assessment History
          </h2>
          <p className="text-xs text-white/80">
            One record per test attempt, tracked under this candidate profile.
          </p>
        </div>
      </div>

      {attempts.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No tests started yet"
          description="Invitations may exist, but this candidate has not started an assessment."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {attempts.map((attempt) => (
            <AttemptRow key={attempt.attempt_id} attempt={attempt} />
          ))}
        </div>
      )}
    </div>
  );
}

