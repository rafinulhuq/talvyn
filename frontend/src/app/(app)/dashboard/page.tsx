import { ArrowUpRight, CircleAlert, FileUp, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityChart } from "@/components/overview/activity-chart";
import { KpiStrip } from "@/components/overview/kpi-strip";
import { Pipeline } from "@/components/overview/pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { formatRelative } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import { requireAppUser } from "@/server/session";
import type { AttentionItem, CompletionItem, DashboardStats, PipelineStage, RoleCompletion, TimelinePoint } from "@/types/stats";

export const metadata: Metadata = { title: "Overview" };

const SEVERITY = {
  danger: { icon: CircleAlert, cls: "text-danger" },
  warning: { icon: TriangleAlert, cls: "text-warning" },
  info: { icon: Info, cls: "text-ink-muted" },
} as const;

// Backend hrefs are trusted to be in-app, but only follow dashboard links.
const inApp = (href: string) => (href.startsWith("/dashboard") && !href.startsWith("//") ? href : "/dashboard");

export default async function OverviewPage() {
  const user = await requireAppUser();
  const [stats, attention, pipeline, timeline, roles, recent] = await Promise.all([
    serverGet<DashboardStats>("/api/v1/stats/"),
    serverGet<{ items: AttentionItem[] }>("/api/v1/stats/attention"),
    serverGet<{ stages: PipelineStage[] }>("/api/v1/stats/pipeline"),
    serverGet<{ points: TimelinePoint[] }>("/api/v1/stats/timeline?days=14"),
    serverGet<{ roles: RoleCompletion[] }>("/api/v1/stats/roles?limit=5"),
    serverGet<{ items: CompletionItem[] }>("/api/v1/stats/completions?days=14&limit=8"),
  ]);
  const first = user.name.split(/\s+/)[0] ?? user.name;
  const newUpload = (
    <Button variant="primary" asChild>
      <Link href="/dashboard/jds/upload">
        <FileUp aria-hidden className="size-4" />
        New job description
      </Link>
    </Button>
  );

  if (!stats.ok) {
    return (
      <>
        <PageHeader title={`Good to see you, ${first}`} actions={newUpload} />
        <ErrorState message={loadErrorMessage(stats.status)} />
      </>
    );
  }

  const s = stats.data;
  if (s.jd_count === 0) {
    return (
      <>
        <PageHeader title={`Welcome to Talvyn, ${first}`} description="Three steps from a job description to graded candidates." />
        <div className="rounded-panel border border-line bg-surface">
          <ol className="divide-y divide-line">
            {[
              ["Add a job description", "Upload a PDF or Word file, or write one from a short brief.", "/dashboard/jds/upload"],
              ["Generate the assessment", "Talvyn extracts the skills and writes technical, reasoning and problem-solving tests.", null],
              ["Invite candidates", "Send private links by email, or share one public link. Every answer is graded with the same rubric.", null],
            ].map(([title, body, href], i) => (
              <li key={title} className="flex items-start gap-4 px-6 py-5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-sm font-medium text-ink-muted">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-md font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-base text-ink-muted">{body}</p>
                </div>
                {href && (
                  <Button variant="primary" size="sm" asChild>
                    <Link href={href}>Start</Link>
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Good to see you, ${first}`} description="What's moving in your hiring pipeline." actions={newUpload} className="pb-0" />

      <KpiStrip
        items={[
          { label: "Job descriptions", value: s.jd_count, href: "/dashboard/jds" },
          { label: "Tests generated", value: s.test_count },
          { label: "Invitations sent", value: s.invitation_count, href: "/dashboard/candidates" },
          { label: "Candidates graded", value: s.evaluation_count, href: "/dashboard/results" },
        ]}
      />

      {attention.ok && attention.data.items.length > 0 && (
        <Panel title="Needs your attention" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {attention.data.items.map((a) => {
              const sev = SEVERITY[a.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
              return (
                <li key={a.kind}>
                  <Link href={inApp(a.href)} className="group flex items-start gap-3 px-5 py-3.5 hover:bg-sunken/50">
                    <sev.icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${sev.cls}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium text-ink">{a.title}</span>
                      <span className="block text-sm text-ink-muted">{a.description}</span>
                    </span>
                    <Badge>{a.count}</Badge>
                    <ArrowUpRight aria-hidden className="mt-0.5 size-4 text-ink-faint group-hover:text-ink" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Activity" description="Last 14 days">
          {timeline.ok ? <ActivityChart points={timeline.data.points} /> : <p className="text-base text-ink-muted">{loadErrorMessage(timeline.status)}</p>}
        </Panel>
        <Panel title="Candidate pipeline" description="All time">
          {pipeline.ok ? <Pipeline stages={pipeline.data.stages} /> : <p className="text-base text-ink-muted">{loadErrorMessage(pipeline.status)}</p>}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent submissions" actions={<Link href="/dashboard/results" className="text-sm text-ink-muted hover:text-ink">View all</Link>} bodyClassName="p-0">
          {!recent.ok ? (
            <p className="px-5 py-6 text-base text-ink-muted">{loadErrorMessage(recent.status)}</p>
          ) : recent.data.items.length === 0 ? (
            <EmptyState title="No submissions in the last 14 days" description="Submitted tests appear here as candidates finish them." />
          ) : (
            <ul className="divide-y divide-line">
              {recent.data.items.map((c) => (
                <li key={c.attempt_id}>
                  <Link href={`/dashboard/results/${c.attempt_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-ink">{c.candidate_name}</span>
                      <span className="block truncate text-sm text-ink-muted">{c.jd_title}</span>
                    </span>
                    <Badge tone={c.has_evaluation ? "success" : "warning"} dot>
                      {c.has_evaluation ? "Graded" : "Grading"}
                    </Badge>
                    <span className="w-24 text-right text-sm text-ink-muted">{formatRelative(c.submitted_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Completion by role" description="Invited candidates who submitted" bodyClassName="p-0">
          {!roles.ok ? (
            <p className="px-5 py-6 text-base text-ink-muted">{loadErrorMessage(roles.status)}</p>
          ) : roles.data.roles.length === 0 ? (
            <EmptyState title="No invitations yet" description="Completion rates appear once candidates are invited." />
          ) : (
            <ul className="divide-y divide-line">
              {roles.data.roles.map((r) => (
                <li key={r.jd_id}>
                  <Link href={`/dashboard/jds/${r.jd_id}`} className="grid grid-cols-[1fr_6rem_4.5rem] items-center gap-3 px-5 py-3 hover:bg-sunken/50">
                    <span className="truncate text-base text-ink">{r.title}</span>
                    <span className="relative h-1.5 rounded-[2px] bg-sunken" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-[2px] bg-chart-1" style={{ width: `${Math.min(100, r.completion_rate)}%` }} />
                    </span>
                    <span className="text-right text-sm">
                      <span className="font-medium text-ink">{Math.round(r.completion_rate)}%</span>
                      <span className="block text-xs text-ink-muted">
                        {r.completed_count} of {r.invited_count}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
