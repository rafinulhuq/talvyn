import { AttemptStatus, TrackedEventType } from "@prisma/client";
import { Download, Sprout } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HighgardenChrome, RangeLinks, RankRow, Stat, StatGrid } from "@/components/highgarden/hg-chrome";
import { RetentionPurge } from "@/components/highgarden/purge";
import { TrendChart, type TrendPoint } from "@/components/highgarden/trend-chart";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { parseRange, rangeStart } from "@/lib/highgarden";
import { requireHighgardenPage } from "@/server/highgarden";
import { prisma } from "@/server/prisma";

export const metadata: Metadata = { title: "Highgarden" };

type SP = { days?: string };
const EXPORTS = [
  { kind: "events", label: "Events" },
  { kind: "sessions", label: "Sessions" },
  { kind: "funnels", label: "Funnels" },
  { kind: "feedback", label: "Feedback" },
];

/** One row per UTC day in the range, zero-filled. Grouped in SQL so busy ranges aren't truncated. */
async function dailyTrend(since: Date, days: number): Promise<TrendPoint[]> {
  const rows = await prisma.$queryRaw<{ day: Date; views: bigint; clicks: bigint }[]>`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
           count(*) FILTER (WHERE type = 'PAGE_VIEW') AS views,
           count(*) FILTER (WHERE type = 'CLICK') AS clicks
    FROM tracked_events
    WHERE created_at >= ${since} AND type IN ('PAGE_VIEW', 'CLICK')
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const out: TrendPoint[] = [];
  for (let i = Math.max(1, days) - 1; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(day);
    out.push({ day, views: Number(r?.views ?? 0), clicks: Number(r?.clicks ?? 0) });
  }
  return out;
}

export default async function HighgardenOverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireHighgardenPage();
  const sp = await searchParams;
  const range = parseRange(sp.days);
  const since = rangeStart(range.days);
  const ev = (type: TrackedEventType) => ({ type, createdAt: { gte: since } });
  const targetGroup = (type: TrackedEventType, take: number) =>
    prisma.trackedEvent.groupBy({
      by: ["path", "targetLabel", "targetSelector"],
      where: ev(type),
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take,
    });

  const [views, clicks, errors, deadClicks, sessions, unreadFeedback, starts, submits, topPages, topClicks, topErrors, topDead, trend] = await Promise.all([
    prisma.trackedEvent.count({ where: ev(TrackedEventType.PAGE_VIEW) }),
    prisma.trackedEvent.count({ where: ev(TrackedEventType.CLICK) }),
    prisma.trackedEvent.count({ where: ev(TrackedEventType.CLIENT_ERROR) }),
    prisma.trackedEvent.count({ where: ev(TrackedEventType.DEAD_CLICK) }),
    prisma.visitorSession.count({ where: { lastSeenAt: { gte: since } } }),
    prisma.highgardenFeedback.count({ where: { status: "UNREAD" } }),
    prisma.testAttempt.count({ where: { startedAt: { gte: since } } }),
    prisma.testAttempt.count({ where: { submittedAt: { gte: since }, status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED] } } }),
    prisma.trackedEvent.groupBy({ by: ["path"], where: ev(TrackedEventType.PAGE_VIEW), _count: { _all: true }, orderBy: { _count: { path: "desc" } }, take: 8 }),
    targetGroup(TrackedEventType.CLICK, 8),
    targetGroup(TrackedEventType.CLIENT_ERROR, 5),
    targetGroup(TrackedEventType.DEAD_CLICK, 5),
    dailyTrend(since, range.days),
  ]);

  const params = { days: sp.days };
  const hasData = views + clicks + errors + deadClicks > 0;
  const maxOf = (rows: { _count: { _all: number } }[]) => Math.max(1, ...rows.map((r) => r._count._all));

  return (
    <div className="flex flex-col gap-5">
      <HighgardenChrome
        section="overview"
        title="Highgarden"
        crumbs={[]}
        description="How people use Talvyn: visits, clicks, friction and feedback across the app, the public site and candidate pages."
        actions={<RangeLinks base="/dashboard/highgarden" current={range.key} params={params} />}
      />

      <StatGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Page views" value={views} />
        <Stat label="Clicks" value={clicks} />
        <Stat label="Visitor sessions" value={sessions} />
        <Stat label="Client errors" value={errors} tone={errors > 0 ? "danger" : undefined} />
        <Stat label="Dead clicks" value={deadClicks} tone={deadClicks > 0 ? "warning" : undefined} />
        <Stat label="Tests started / submitted" value={`${starts.toLocaleString("en")} / ${submits.toLocaleString("en")}`} />
      </StatGrid>

      {unreadFeedback > 0 && (
        <p className="-mt-2 text-base text-ink-muted">
          <Link href="/dashboard/highgarden/feedback?status=UNREAD" className="text-accent hover:underline">
            {unreadFeedback.toLocaleString("en")} unread feedback {unreadFeedback === 1 ? "message" : "messages"}
          </Link>{" "}
          waiting for review.
        </p>
      )}

      {!hasData ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            icon={Sprout}
            title={`Nothing recorded in the last ${range.key === "today" ? "day" : `${range.days} days`}`}
            description="Events appear as soon as someone opens a page. Try a longer range, or open the public site in another tab."
          />
        </div>
      ) : (
        <>
          <Panel title="Daily activity" description="Page views and clicks per UTC day." actions={<Link href="/dashboard/highgarden/sessions" className="text-sm text-accent hover:underline">View sessions</Link>}>
            <TrendChart points={trend} />
          </Panel>

          {(errors > 0 || deadClicks > 0) && (
            <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
              <Panel title="Top client errors" description="Uncaught errors in the browser, by message." bodyClassName="p-3">
                {topErrors.length === 0 ? (
                  <p className="px-2 py-1.5 text-base text-ink-muted">No client errors in this range.</p>
                ) : (
                  <ul className="flex flex-col">
                    {topErrors.map((r) => (
                      <RankRow key={`${r.path}|${r.targetSelector}|${r.targetLabel}`} label={r.targetLabel || "Unknown error"} sublabel={r.path} value={r._count._all} max={maxOf(topErrors)} />
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Top dead clicks" description="Clicks that did nothing, or repeated clicks on one target." bodyClassName="p-3">
                {topDead.length === 0 ? (
                  <p className="px-2 py-1.5 text-base text-ink-muted">No dead clicks in this range.</p>
                ) : (
                  <ul className="flex flex-col">
                    {topDead.map((r) => (
                      <RankRow
                        key={`${r.path}|${r.targetSelector}|${r.targetLabel}`}
                        label={r.targetLabel || r.targetSelector || "Unknown target"}
                        sublabel={r.path}
                        value={r._count._all}
                        max={maxOf(topDead)}
                        href={`/dashboard/highgarden/heatmaps?path=${encodeURIComponent(r.path)}${sp.days ? `&days=${sp.days}` : ""}`}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Panel title="Top pages" bodyClassName="p-3">
              <ul className="flex flex-col">
                {topPages.map((r) => (
                  <RankRow key={r.path} label={r.path} value={r._count._all} max={maxOf(topPages)} />
                ))}
              </ul>
            </Panel>
            <Panel title="Most-clicked elements" bodyClassName="p-3">
              {topClicks.length === 0 ? (
                <p className="px-2 py-1.5 text-base text-ink-muted">No clicks in this range.</p>
              ) : (
                <ul className="flex flex-col">
                  {topClicks.map((r) => (
                    <RankRow key={`${r.path}|${r.targetSelector}|${r.targetLabel}`} label={r.targetLabel || r.targetSelector || "Unlabelled element"} sublabel={r.path} value={r._count._all} max={maxOf(topClicks)} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel title="Export CSV" description={`Raw rows for the selected range, up to 5,000 each.`}>
          <div className="flex flex-wrap gap-2">
            {EXPORTS.map((e) => (
              <Button key={e.kind} asChild variant="secondary" size="sm">
                <a href={`/api/highgarden/exports/${e.kind}?days=${range.key}`} download>
                  <Download aria-hidden className="size-3.5" /> {e.label}
                </a>
              </Button>
            ))}
          </div>
        </Panel>
        <Panel title="Retention" description="Raw events are kept for 90 days. Feedback is kept until you delete it.">
          <RetentionPurge />
        </Panel>
        <Panel title="What Highgarden collects">
          <p className="text-base text-ink-muted">
            Page paths, click labels and selectors, coarse device and browser, viewport size, referrer origin, and country when the CDN provides it. Never form values, passwords, candidate answers, uploaded documents or tokens.
          </p>
        </Panel>
      </div>
    </div>
  );
}
