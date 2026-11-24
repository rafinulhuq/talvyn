import { TrackedEventType } from "@prisma/client";
import { AlertTriangle, Bug, Eye, MousePointerClick } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HighgardenChrome, Stat, StatGrid } from "@/components/highgarden/hg-chrome";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { formatDateTime } from "@/lib/format";
import { EVENT_LABEL, EXAM_PREFIXES, areaLabel, deviceLabel, formatDuration } from "@/lib/highgarden";
import { isSafeId } from "@/server/auth/require-user";
import { requireHighgardenPage } from "@/server/highgarden";
import { prisma } from "@/server/prisma";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Session · Highgarden" };

const EVENT_CAP = 2000;
type Ev = { id: string; type: TrackedEventType; path: string; targetLabel: string | null; targetSelector: string | null; createdAt: Date };

/** A new visit starts at every page view. */
function groupVisits(events: Ev[]) {
  const groups: { path: string; at: Date; events: Ev[] }[] = [];
  for (const e of events) {
    if (e.type === TrackedEventType.PAGE_VIEW || groups.length === 0) groups.push({ path: e.path, at: e.createdAt, events: [] });
    if (e.type !== TrackedEventType.PAGE_VIEW) groups.at(-1)!.events.push(e);
  }
  return groups;
}

function signals(events: Ev[]): string[] {
  const out: string[] = [];
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== TrackedEventType.CLICK) continue;
    const k = e.targetSelector || e.targetLabel;
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const repeated = [...counts.values()].filter((n) => n >= 3).length;
  if (repeated) out.push(`${repeated} target${repeated === 1 ? "" : "s"} clicked 3+ times`);
  const views = events.filter((e) => e.type === TrackedEventType.PAGE_VIEW);
  if (views.some((v, i) => { const third = views[i + 2]; return third !== undefined && third.createdAt.getTime() - v.createdAt.getTime() <= 15_000; })) {
    out.push("Rapid page changes (3 pages in 15s)");
  }
  const inExam = events.some((e) => EXAM_PREFIXES.some((p) => e.path === p || e.path.startsWith(`${p}/`)));
  const finished = events.some((e) => e.path.startsWith("/test/complete"));
  if (inExam && !finished) out.push("Entered a test but never reached the completion page");
  return out;
}

const ICON = {
  [TrackedEventType.CLICK]: MousePointerClick,
  [TrackedEventType.DEAD_CLICK]: AlertTriangle,
  [TrackedEventType.CLIENT_ERROR]: Bug,
  [TrackedEventType.PAGE_VIEW]: Eye,
};

const time = (d: Date) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);

export default async function HighgardenSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireHighgardenPage();
  const { id } = await params;
  if (!isSafeId(id)) notFound();
  const session = await prisma.visitorSession.findUnique({
    where: { id },
    include: {
      _count: { select: { events: true } },
      events: { orderBy: { createdAt: "asc" }, take: EVENT_CAP },
      feedback: { orderBy: { createdAt: "asc" }, select: { id: true, rating: true, category: true, comment: true, path: true, createdAt: true } },
    },
  });
  if (!session) notFound();

  const events = session.events;
  const first = events[0];
  const last = events.at(-1);
  const meta = events.find((e) => e.browserName || e.deviceType);
  const views = events.filter((e) => e.type === TrackedEventType.PAGE_VIEW).length;
  const errors = events.filter((e) => e.type === TrackedEventType.CLIENT_ERROR).length;
  const dead = events.filter((e) => e.type === TrackedEventType.DEAD_CLICK).length;
  const visits = groupVisits(events);
  const flags = signals(events);

  return (
    <div className="flex flex-col gap-5">
      <HighgardenChrome
        section="sessions"
        title={`Session ${session.id.slice(0, 8)}`}
        crumbs={[
          { label: "Highgarden", href: "/dashboard/highgarden" },
          { label: "Sessions", href: "/dashboard/highgarden/sessions" },
          { label: session.id.slice(0, 8) },
        ]}
        description={
          first
            ? `${formatDateTime(first.createdAt.toISOString())} · ${areaLabel(first.path)} · ${[meta?.deviceType ? deviceLabel(meta.deviceType) : null, meta?.browserName, meta?.osName, meta?.country].filter(Boolean).join(" · ") || "Unknown device"}`
            : "This session has no recorded events."
        }
      />

      <StatGrid className="grid-cols-2 md:grid-cols-5">
        <Stat label="Duration" value={first && last ? formatDuration(last.createdAt.getTime() - first.createdAt.getTime()) : "—"} />
        <Stat label="Pages viewed" value={views} />
        <Stat label="Events" value={session._count.events} />
        <Stat label="Client errors" value={errors} tone={errors ? "danger" : undefined} />
        <Stat label="Dead clicks" value={dead} tone={dead ? "warning" : undefined} />
      </StatGrid>

      {(flags.length > 0 || session.feedback.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {flags.length > 0 && (
            <Panel title="Friction signals">
              <ul className="flex flex-col gap-1.5 text-base text-ink">
                {flags.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <AlertTriangle aria-hidden className="size-4 text-warning" /> {f}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {session.feedback.length > 0 && (
            <Panel title="Feedback from this visitor">
              <ul className="flex flex-col gap-3">
                {session.feedback.map((f) => (
                  <li key={f.id} className="text-base">
                    <span className="flex items-center gap-2">
                      <Badge tone={f.rating <= 2 ? "danger" : f.rating === 3 ? "warning" : "success"}>{f.rating}/5</Badge>
                      <span className="text-ink">{f.category}</span>
                      <span className="font-mono text-xs text-ink-muted">{f.path}</span>
                    </span>
                    {f.comment && <p className="mt-1 text-ink-muted">{f.comment}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <Panel title="Timeline" description={session._count.events > EVENT_CAP ? `Showing the first ${EVENT_CAP.toLocaleString("en")} of ${session._count.events.toLocaleString("en")} events.` : "Every page visit in order, with the clicks and errors on it."} bodyClassName="p-0">
        <ol className="divide-y divide-line">
          {visits.map((v, i) => {
            const next = visits[i + 1]?.at ?? last?.createdAt ?? v.at;
            return (
              <li key={`${v.at.getTime()}-${i}`} className="px-5 py-3.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-ink-faint">{time(v.at)}</span>
                  <span className="min-w-0 break-all font-mono text-sm text-ink">{v.path}</span>
                  <span className="ml-auto text-sm tabular-nums text-ink-faint">{formatDuration(next.getTime() - v.at.getTime())}</span>
                </div>
                {v.events.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 border-l border-line pl-4 sm:ml-[5.75rem]">
                    {v.events.map((e) => {
                      const Icon = ICON[e.type];
                      return (
                        <li key={e.id} className="flex items-start gap-2 text-sm">
                          <Icon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", e.type === TrackedEventType.CLIENT_ERROR ? "text-danger" : e.type === TrackedEventType.DEAD_CLICK ? "text-warning" : "text-ink-muted")} />
                          <span className="sr-only">{EVENT_LABEL[e.type]}:</span>
                          <span className="min-w-0 flex-1">
                            <span className={cn(e.type === TrackedEventType.CLIENT_ERROR ? "text-danger" : "text-ink")}>{e.targetLabel || e.targetSelector || EVENT_LABEL[e.type]}</span>
                            {e.targetSelector && e.targetLabel && <span className="ml-2 font-mono text-xs text-ink-faint">{e.targetSelector}</span>}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-ink-faint">{time(e.createdAt)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}
