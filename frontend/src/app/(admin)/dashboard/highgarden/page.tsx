import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { Activity, AlertTriangle, Bug, Download, MousePointerClick, Eye, Users, Sprout } from "lucide-react";
import { AttemptStatus, TrackedEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";
import { PurgeButton } from "./PurgeButton";
import { SignOutButton } from "./SignOutButton";

function startDate(days: number): Date {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (days === 1) date.setHours(0, 0, 0, 0);
  return date;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveDaysParam(raw: string | undefined): { selectedPreset: string; days: number } {
  const presets: Record<string, number> = { today: 1, "7": 7, "90": 90 };
  const selectedPreset = raw && raw in presets ? raw : "30";
  return { selectedPreset, days: presets[selectedPreset] ?? 30 };
}

const datePresets = [
  { label: "Today", value: "today" },
  { label: "7d", value: "7" },
  { label: "30d", value: "30" },
  { label: "90d", value: "90" },
];
const navLinks = [
  { href: "/dashboard/highgarden/funnels", label: "View funnels" },
  { href: "/dashboard/highgarden/heatmaps", label: "View heatmaps" },
  { href: "/dashboard/highgarden/feedback", label: "View feedback" },
  { href: "/dashboard/highgarden/alerts", label: "View alerts" },
  { href: "/dashboard/highgarden/sessions", label: "View sessions" },
];
const exportKinds = ["events", "sessions", "funnels", "feedback"];

export default async function HighgardenPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireHighgardenAccess();
  const params = await searchParams;
  const { selectedPreset, days } = resolveDaysParam(params.days);
  const since = startDate(days);
  const weekSince = startDate(7);

  const [
    views,
    clicks,
    errors,
    deadClicks,
    sessions,
    topPages,
    topClicks,
    topErrors,
    topDeadClicks,
    recentEvents,
    weeklyViews,
    weeklySessions,
    weeklyCandidateStarts,
    weeklyCandidateSubmits,
    weeklyFrictionRows,
  ] = await Promise.all([
    prisma.trackedEvent.count({ where: { type: TrackedEventType.PAGE_VIEW, createdAt: { gte: since } } }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.CLICK, createdAt: { gte: since } } }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.CLIENT_ERROR, createdAt: { gte: since } } }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.DEAD_CLICK, createdAt: { gte: since } } }),
    prisma.visitorSession.count({ where: { lastSeenAt: { gte: since } } }),
    prisma.trackedEvent.groupBy({
      by: ["path"],
      where: { type: TrackedEventType.PAGE_VIEW, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    prisma.trackedEvent.groupBy({
      by: ["path", "targetLabel", "targetSelector"],
      where: { type: TrackedEventType.CLICK, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    prisma.trackedEvent.groupBy({
      by: ["targetLabel", "targetSelector", "path"],
      where: { type: TrackedEventType.CLIENT_ERROR, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { targetLabel: "desc" } },
      take: 5,
    }),
    prisma.trackedEvent.groupBy({
      by: ["path", "targetLabel", "targetSelector"],
      where: { type: TrackedEventType.DEAD_CLICK, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 5,
    }),
    prisma.trackedEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.PAGE_VIEW, createdAt: { gte: weekSince } } }),
    prisma.visitorSession.count({ where: { lastSeenAt: { gte: weekSince } } }),
    prisma.testAttempt.count({ where: { startedAt: { gte: weekSince } } }),
    prisma.testAttempt.count({
      where: {
        submittedAt: { gte: weekSince },
        status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED] },
      },
    }),
    prisma.trackedEvent.groupBy({
      by: ["path"],
      where: { type: { in: [TrackedEventType.CLIENT_ERROR, TrackedEventType.DEAD_CLICK] }, createdAt: { gte: weekSince } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 3,
    }),
  ]);

  const trend = new Map<string, { views: number; clicks: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    trend.set(dayKey(startDate(i)), { views: 0, clicks: 0 });
  }
  for (const event of recentEvents) {
    const row = trend.get(dayKey(event.createdAt));
    if (!row) continue;
    if (event.type === TrackedEventType.PAGE_VIEW) row.views += 1;
    if (event.type === TrackedEventType.CLICK) row.clicks += 1;
  }
  const trendRows = [...trend.entries()];
  const maxTrend = Math.max(1, ...trendRows.map(([, row]) => row.views + row.clicks));

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <Sprout className="h-4 w-4" />
            Telemetry &amp; Observability
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Highgarden Telemetry
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Real-time page views, engagement signals, and interaction insights across Talvyn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className={pillClass(false)}>
              {link.label}
            </Link>
          ))}
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />
          {datePresets.map((preset) => (
            <Link
              key={preset.value}
              href={`/dashboard/highgarden?days=${preset.value}`}
              className={pillClass(selectedPreset === preset.value)}
            >
              {preset.label}
            </Link>
          ))}
          <SignOutButton />
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        <Metric icon={Eye} label="Page views" value={views} />
        <Metric icon={MousePointerClick} label="Clicks" value={clicks} />
        <Metric icon={Users} label="Visitor sessions" value={sessions} />
        <Metric icon={Bug} label="Client errors" value={errors} />
        <Metric icon={AlertTriangle} label="Dead clicks" value={deadClicks} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Weekly Summary</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <MiniMetric label="Visits" value={weeklyViews} />
            <MiniMetric label="Unique sessions" value={weeklySessions} />
            <MiniMetric label="Candidate starts" value={weeklyCandidateStarts} />
            <MiniMetric label="Candidate submits" value={weeklyCandidateSubmits} />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Top Friction Pages</p>
            <FrictionList rows={weeklyFrictionRows} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Download className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">CSV Exports</h2>
          </div>
          <div className="grid gap-2">
            {exportKinds.map((kind) => (
              <a
                key={kind}
                href={`/api/highgarden/exports/${kind}?days=${selectedPreset}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
              >
                <span>Export {kind}</span>
                <Download className="h-3.5 w-3.5 text-slate-400" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <NeedsAttentionPanel errors={errors} deadClicks={deadClicks} topErrors={topErrors} topDeadClicks={topDeadClicks} />

      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily Activity Trend</h2>
          <Link href="/dashboard/highgarden/sessions" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
            View sessions →
          </Link>
        </div>
        <div className="flex h-36 items-end gap-1.5 pt-2">
          {trendRows.map(([date, row]) => (
            <div key={date} title={`${date}: ${row.views} views, ${row.clicks} clicks`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end rounded-t bg-slate-100 dark:bg-slate-800/80 overflow-hidden" style={{ height: "120px" }}>
                <div className="bg-indigo-600 dark:bg-indigo-500 transition-all" style={{ height: `${Math.max(2, (row.views / maxTrend) * 120)}px` }} />
                <div className="bg-indigo-300 dark:bg-indigo-800 transition-all" style={{ height: `${Math.max(0, (row.clicks / maxTrend) * 120)}px` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600 dark:bg-indigo-500" />
            <span>Page Views</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-300 dark:bg-indigo-800" />
            <span>Clicks</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Table title="Top Pages" empty="No page views yet.">
          {topPages.map((row) => (
            <Row key={row.path} label={row.path} value={row._count._all} />
          ))}
        </Table>
        <Table title="Top Clicked Elements" empty="No clicks yet.">
          {topClicks.map((row) => (
            <Row
              key={`${row.path}:${row.targetSelector}:${row.targetLabel}`}
              label={row.targetLabel || row.targetSelector || "Unknown element"}
              sublabel={row.path}
              value={row._count._all}
            />
          ))}
        </Table>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Data Retention</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Raw Highgarden telemetry events are intended for 90-day retention.</p>
        <PurgeButton />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Privacy &amp; Collection Policy</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Highgarden records page paths, click labels/selectors, coarse device context, viewport size, referrer,
          and safe workflow metadata. It does not collect form values, passwords, candidate answers, uploaded
          document text, or authentication tokens.
        </p>
      </div>
    </div>
  );
}

function pillClass(selected: boolean): string {
  return selected
    ? "rounded-lg bg-[#F2D74E] px-3 py-1.5 text-xs font-semibold text-[#1A1600] shadow-xs"
    : "rounded-lg border border-white/10 bg-[#181A1F] px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:border-white/20";
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-600/10 dark:bg-indigo-950/40 dark:text-indigo-400">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{value.toLocaleString()}</p>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function Table({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-2 dark:border-slate-800">{title}</h2>
      {hasRows ? (
        <div className="flex flex-col gap-2">{children}</div>
      ) : (
        <p className="text-xs text-slate-500">{empty}</p>
      )}
    </div>
  );
}

type FrictionRow = { path: string; _count: { _all: number } };

function FrictionList({ rows }: { rows: FrictionRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">No error or dead-click friction in the last 7 days.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <Row key={row.path} label={row.path} value={row._count._all} />
      ))}
    </div>
  );
}

type AttentionRow = { path: string; targetLabel: string | null; targetSelector: string | null; _count: { _all: number } };

function NeedsAttentionPanel({
  errors,
  deadClicks,
  topErrors,
  topDeadClicks,
}: {
  errors: number;
  deadClicks: number;
  topErrors: AttentionRow[];
  topDeadClicks: AttentionRow[];
}) {
  const signalCount = errors + deadClicks;
  if (signalCount === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50/70 p-5 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/20">
      <div className="mb-4 flex items-center gap-2 border-b border-rose-200/50 pb-3 dark:border-rose-900/50">
        <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
        <h2 className="text-sm font-semibold text-rose-900 dark:text-rose-300">Attention Required</h2>
        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
          {signalCount} signal{signalCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionList title="Top Client Errors" empty="No client errors in this range.">
          {topErrors.map((row) => (
            <Row
              key={`${row.targetSelector}:${row.targetLabel}:${row.path}`}
              label={row.targetLabel || row.targetSelector || "Unknown error"}
              sublabel={row.path}
              value={row._count._all}
            />
          ))}
        </AttentionList>
        <AttentionList title="Top Dead Clicks" empty="No dead clicks in this range.">
          {topDeadClicks.map((row) => (
            <Row
              key={`${row.path}:${row.targetSelector}:${row.targetLabel}`}
              label={row.targetLabel || row.targetSelector || "Unknown target"}
              sublabel={row.path}
              value={row._count._all}
            />
          ))}
        </AttentionList>
      </div>
    </div>
  );
}

function AttentionList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-rose-800 dark:text-rose-400">{title}</h3>
      {hasRows ? (
        <div className="flex flex-col gap-1.5">{children}</div>
      ) : (
        <p className="text-xs text-rose-600/70">{empty}</p>
      )}
    </div>
  );
}

function Row({ label, sublabel, value }: { label: string; sublabel?: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200/70 bg-white px-3 py-2 shadow-xs transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/80">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{label}</p>
        {sublabel && <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{sublabel}</p>}
      </div>
      <span className="font-semibold text-xs text-slate-700 dark:text-slate-300 shrink-0">{value.toLocaleString()}</span>
    </div>
  );
}
