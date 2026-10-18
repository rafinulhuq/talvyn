import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  FileText,
  ClipboardList,
  ArrowRight,
  ClipboardCheck,
  AlertTriangle,
  Mail,
  Activity,
  Sparkles,
  CheckCircle2,
  CheckCircle,
  Plus,
  TrendingUp,
} from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/types";
import { serverFetch, serverFetchRaw } from "@/lib/api/serverFetch";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { HealthReadyResponse, ServiceCheck } from "@/lib/api/health";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import type { ActivityPoint } from "@/components/admin/dashboard/ActivityChart";
import { ActivityChartClient } from "@/components/admin/dashboard/ActivityChartClient";
import { CandidatePipeline, type PipelineStage } from "@/components/admin/dashboard/CandidatePipeline";
import { RecentActivity, type ActivityEvent } from "@/components/admin/dashboard/RecentActivity";
import { TopRoles, type RoleCompletion } from "@/components/admin/dashboard/TopRoles";
import { SystemStatusCard } from "@/components/admin/dashboard/SystemStatusCard";
import { RoleCockpit } from "@/components/admin/dashboard/RoleCockpit";

export const metadata: Metadata = { title: "Dashboard" };

// Always fetch fresh — stats change on every generation/evaluation.
export const revalidate = 0;

interface DashboardStats {
  jd_count: number;
  test_count: number;
  invitation_count: number;
  evaluation_count: number;
}

interface AttentionItem {
  kind: string;
  severity: "info" | "warning" | "danger";
  count: number;
  title: string;
  description: string;
  href: string;
}

interface AttentionResponse {
  items: AttentionItem[];
}

interface PipelineResponse {
  stages: PipelineStage[];
}

interface TimelineResponse {
  points: ActivityPoint[];
}

interface RolesResponse {
  roles: RoleCompletion[];
}

interface CompletionItem {
  attempt_id: string;
  candidate_name: string;
  jd_title: string;
  submitted_at: string;
  has_evaluation: boolean;
}

interface CompletionsResponse {
  items: CompletionItem[];
}

interface AuditLogEntry {
  id: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  summary: string | null;
  created_at: string;
}

interface AuditLogListResponse {
  items: AuditLogEntry[];
}

const ATTENTION_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  draft_tests: ClipboardCheck,
  pending_evaluation: ClipboardList,
  email_failures: Mail,
  jds_without_tests: FileText,
  unhealthy_checks: Activity,
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  INVITATION_REVOKED: "Invitation revoked",
  INVITATION_RESENT: "Invitation resent",
  EVALUATION_OVERRIDDEN: "Evaluation override applied",
  QUESTION_SCORE_OVERRIDDEN: "Question score overridden",
  DATA_RESET: "Workspace data reset",
  DATA_RESTORED: "Workspace data restored",
};

function computeAttentionItems(
  attention: AttentionResponse | null,
  health: { data: HealthReadyResponse | null }
): AttentionItem[] {
  const attentionItems: AttentionItem[] = [...(attention?.items ?? [])];

  const unhealthyChecks = health.data
    ? Object.values(health.data.checks).filter(
        (check): check is ServiceCheck => !!check && check.status !== "ok"
      )
    : [];
  if (unhealthyChecks.length > 0) {
    attentionItems.push({
      kind: "unhealthy_checks",
      severity: "danger",
      count: unhealthyChecks.length,
      title: `${unhealthyChecks.length} system health check${unhealthyChecks.length !== 1 ? "s" : ""} need attention`,
      description: "Email, storage, AI engine, or worker may be misconfigured.",
      href: "/dashboard/settings",
    });
  }

  return attentionItems;
}

function computeCompletionStats(
  pipeline: PipelineResponse | null,
  stats: DashboardStats | null
): { invitedCount: number; submittedCount: number; completionRate: number } {
  const invitedCount =
    pipeline?.stages.find((s) => s.key === "invited")?.count ?? stats?.invitation_count ?? 0;
  const submittedCount = pipeline?.stages.find((s) => s.key === "submitted")?.count ?? 0;
  const completionRate = invitedCount > 0 ? Math.round((submittedCount / invitedCount) * 100) : 0;
  return { invitedCount, submittedCount, completionRate };
}

function buildActivityEvents(
  completions: CompletionsResponse | null,
  auditLog: AuditLogListResponse | null
): ActivityEvent[] {
  return [
    ...(completions?.items ?? []).map((item): ActivityEvent => ({
      id: `completion-${item.attempt_id}`,
      time: item.submitted_at,
      title: item.has_evaluation ? "AI evaluation completed" : "Candidate submitted assessment",
      subtitle: `${item.candidate_name} — ${item.jd_title}`,
      actor: item.candidate_name,
      status: item.has_evaluation ? "success" : "warning",
    })),
    ...(auditLog?.items ?? []).map((entry): ActivityEvent => ({
      id: `audit-${entry.id}`,
      time: entry.created_at,
      title: AUDIT_ACTION_LABELS[entry.action] ?? entry.action,
      subtitle: entry.summary ?? "—",
      actor: entry.actor_name ?? entry.actor_email ?? "System",
      status: entry.action.startsWith("DATA_") ? "danger" : "info",
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 10);
}

function DashboardAttentionSection({
  attentionItems,
  hasAttentionData,
}: {
  attentionItems: AttentionItem[];
  hasAttentionData: boolean;
}) {
  if (attentionItems.length > 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-600" />
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Action Required · Bottlenecks
          </h2>
          <span className="rounded-full bg-rose-50 border border-rose-200/80 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
            {attentionItems.length} Pending
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {attentionItems.map((item) => {
            const Icon = ATTENTION_ICONS[item.kind] ?? AlertTriangle;
            return (
              <Link
                key={item.kind}
                href={item.href}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {item.count > 0 && (
                        <span className="font-display text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          {item.count}
                        </span>
                      )}
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-700 dark:group-hover:bg-indigo-950/50 dark:group-hover:text-indigo-300">
                  <span>Take Action</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  if (hasAttentionData) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">
            System Operating Optimally
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            No drafts, unreviewed attempts, or pending evaluations need attention right now.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function DashboardPipelineSection({ pipeline }: { pipeline: PipelineResponse | null }) {
  if (!pipeline || !pipeline.stages.some((s) => s.count > 0)) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Candidate Assessment Funnel
          </h3>
          <p className="text-xs text-slate-500">
            Active candidate yield and progression across assessment stages.
          </p>
        </div>
      </div>
      <CandidatePipeline stages={pipeline.stages} />
    </section>
  );
}

function DashboardVelocitySection({ timeline }: { timeline: TimelineResponse | null }) {
  const hasActivity = !!timeline?.points.some((p) => p.invitations + p.submitted + p.evaluated > 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Assessment Velocity
          </h3>
          <p className="text-xs text-slate-500">
            Daily invitations, submissions, and evaluations over the last 14 days.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-500">
            <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
            Invitations
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            Submitted
          </span>
        </div>
      </div>
      {hasActivity ? (
        <ActivityChartClient points={timeline!.points} />
      ) : (
        <p className="py-12 text-center text-xs text-slate-400">
          No activity recorded in the last 14 days yet.
        </p>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userRole = (session?.user?.role as UserRole) ?? "USER";
  const userName = session?.user?.name ?? "";
  const userEmail = session?.user?.email ?? "";

  const [
    stats,
    attention,
    health,
    pipeline,
    timeline,
    roles,
    completions,
    auditLog,
    pendingSignupCount,
    totalUserCount,
  ] = await Promise.all([
    serverFetch<DashboardStats>("/api/v1/stats/", { cache: "no-store" }),
    serverFetch<AttentionResponse>("/api/v1/stats/attention", { cache: "no-store" }),
    serverFetchRaw<HealthReadyResponse>("/api/v1/health/ready"),
    serverFetch<PipelineResponse>("/api/v1/stats/pipeline", { cache: "no-store" }),
    serverFetch<TimelineResponse>("/api/v1/stats/timeline?days=14", { cache: "no-store" }),
    serverFetch<RolesResponse>("/api/v1/stats/roles?limit=5", { cache: "no-store" }),
    serverFetch<CompletionsResponse>("/api/v1/stats/completions?days=14&limit=10", {
      cache: "no-store",
    }),
    serverFetch<AuditLogListResponse>("/api/v1/admin/audit-log?page=1&page_size=10", {
      cache: "no-store",
    }),
    prisma.user.count({ where: { signupStatus: "PENDING" } }).catch(() => 0),
    prisma.user.count().catch(() => 0),
  ]);

  const attentionItems = computeAttentionItems(attention, health);
  const { invitedCount, submittedCount, completionRate } = computeCompletionStats(pipeline, stats);
  const activityEvents = buildActivityEvents(completions, auditLog);

  const unhealthyChecks = health.data
    ? Object.values(health.data.checks).filter(
        (check): check is ServiceCheck => !!check && check.status !== "ok"
      )
    : [];

  const statCards = [
    {
      label: "Job Descriptions",
      value: stats?.jd_count ?? 0,
      href: "/dashboard/jds",
      icon: FileText,
    },
    {
      label: "Tests Generated",
      value: stats?.test_count ?? 0,
      href: "/dashboard/jds",
      icon: ClipboardCheck,
    },
    {
      label: "Invitations Sent",
      value: stats?.invitation_count ?? 0,
      href: "/dashboard/candidates",
      icon: Mail,
    },
    {
      label: "AI Evaluations",
      value: stats?.evaluation_count ?? 0,
      href: "/dashboard/results",
      icon: Sparkles,
    },
    {
      label: "Completion Rate",
      value: `${completionRate}%`,
      hint: `${submittedCount} of ${invitedCount} invited`,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="w-full space-y-6">
      {/* 1. Dynamic Role Cockpit Banner with View Switcher */}
      <RoleCockpit
        initialRole={userRole}
        userName={userName}
        userEmail={userEmail}
        pendingSignupCount={pendingSignupCount}
        totalUserCount={totalUserCount}
        unhealthyChecksCount={unhealthyChecks.length}
      />

      {/* 2. Top Page Header with Action Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Workspace Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Hiring assessment telemetry, active pipelines, and candidate integrity signals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/jds/upload"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 px-3.5 text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            Upload Job Description
          </Link>
        </div>
      </div>

      {/* 3. Action Queue / Needs Attention */}
      <DashboardAttentionSection attentionItems={attentionItems} hasAttentionData={!!attention} />

      {/* 4. KPI Summary Row */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      {/* 5. Candidate Pipeline Funnel */}
      <DashboardPipelineSection pipeline={pipeline} />

      {/* 6. Main 7:5 Split Workspace */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Left (7 cols): Assessment Velocity & Top Roles */}
        <div className="space-y-6 lg:col-span-7">
          {/* Velocity Area Chart */}
          <DashboardVelocitySection timeline={timeline} />

          {/* Top Roles by Completion */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Top Roles by Completion
                </h3>
                <p className="text-xs text-slate-500">
                  Job descriptions ranked by candidate exam completion rate.
                </p>
              </div>
              <Link
                href="/dashboard/jds"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
              >
                View all &rarr;
              </Link>
            </div>
            <TopRoles roles={roles?.roles ?? []} />
          </div>
        </div>

        {/* Right (5 cols): Live Activity Feed & Infrastructure Health */}
        <div className="space-y-6 lg:col-span-5">
          {/* Filterable Activity Feed */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Live Activity Feed
              </h3>
              <p className="text-xs text-slate-500">
                Candidate submissions and sensitive workspace audit events.
              </p>
            </div>
            <RecentActivity events={activityEvents} />
          </div>

          {/* Infrastructure Health */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Local Infrastructure
                </h3>
                <p className="text-xs text-slate-500">
                  100% self-hosted zero-cost service health telemetry.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300">
                Zero-Cost
              </span>
            </div>
            <SystemStatusCard checks={health.data?.checks} />
          </div>
        </div>
      </section>
    </div>
  );
}

