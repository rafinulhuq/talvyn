import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedEventType, type TrackedEvent } from "@prisma/client";
import { AlertTriangle, Eye, MousePointerClick, Route } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";
import { CopySessionLink } from "./CopySessionLink";

type TimelineEvent = Pick<
  TrackedEvent,
  | "id"
  | "type"
  | "path"
  | "targetLabel"
  | "targetSelector"
  | "createdAt"
  | "deviceType"
  | "browserName"
  | "osName"
  | "referrer"
>;

type VisitGroup = {
  id: string;
  path: string;
  startedAt: Date;
  events: TimelineEvent[];
};

function formatDuration(start: Date, end: Date): string {
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function groupVisits(events: TimelineEvent[]): VisitGroup[] {
  const groups: VisitGroup[] = [];
  for (const event of events) {
    if (event.type === TrackedEventType.PAGE_VIEW || groups.length === 0) {
      groups.push({
        id: event.id,
        path: event.path,
        startedAt: event.createdAt,
        events: [event],
      });
      continue;
    }
    groups[groups.length - 1].events.push(event);
  }
  return groups;
}

function frictionSignals(events: TimelineEvent[]): string[] {
  const signals: string[] = [];
  const clickCounts = new Map<string, number>();
  for (const event of events) {
    if (event.type !== TrackedEventType.CLICK) continue;
    const key = event.targetSelector || event.targetLabel;
    if (!key) continue;
    clickCounts.set(key, (clickCounts.get(key) ?? 0) + 1);
  }
  const repeated = [...clickCounts.entries()].filter(([, count]) => count >= 3);
  if (repeated.length) signals.push(`${repeated.length} repeated-click target${repeated.length === 1 ? "" : "s"}`);

  const pageViews = events.filter((event) => event.type === TrackedEventType.PAGE_VIEW);
  for (let i = 0; i + 2 < pageViews.length; i += 1) {
    const spanSeconds = (pageViews[i + 2].createdAt.getTime() - pageViews[i].createdAt.getTime()) / 1000;
    if (spanSeconds <= 15) {
      signals.push("rapid route changes");
      break;
    }
  }

  const paths = events.map((event) => event.path);
  const enteredExam = paths.some((path) => path.startsWith("/tests") || path.startsWith("/test") || path.startsWith("/exam"));
  const completedExam = paths.some((path) => path.includes("complete") || path.includes("submitted"));
  if (enteredExam && !completedExam) signals.push("candidate exam may be abandoned");

  return signals;
}

export default async function HighgardenSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireHighgardenAccess();
  const { id } = await params;
  const session = await prisma.visitorSession.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) notFound();

  const groups = groupVisits(session.events);
  const signals = frictionSignals(session.events);
  const firstEvent = session.events[0];
  const lastEvent = session.events.at(-1);
  const device = session.events.find((event) => event.deviceType)?.deviceType || "unknown";
  const browser = session.events.find((event) => event.browserName)?.browserName;
  const os = session.events.find((event) => event.osName)?.osName;

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/highgarden/sessions" className="text-sm font-medium text-brand-600 dark:text-brand-400">
            Back to sessions
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Session timeline</h1>
          <p className="break-all text-sm text-slate-500 dark:text-slate-400">{session.id}</p>
        </div>
        <CopySessionLink />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <Info label="Duration" value={formatDuration(session.firstSeenAt, session.lastSeenAt)} />
        <Info label="Events" value={session.events.length.toLocaleString()} />
        <Info label="Entry page" value={firstEvent?.path || "Unknown"} />
        <Info label="Exit page" value={lastEvent?.path || "Unknown"} />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Info label="First seen" value={session.firstSeenAt.toLocaleString()} />
        <Info label="Last seen" value={session.lastSeenAt.toLocaleString()} />
        <Info label="Device" value={[device, browser, os].filter(Boolean).join(" / ")} />
      </div>

      {signals.length > 0 && (
        <div className="mb-6 rounded-2xl bg-warning-light p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-dark" />
            <h2 className="text-sm font-semibold text-warning-dark">Friction signals</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span key={signal} className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-warning-dark">
                {signal}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
        {groups.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No events recorded for this session.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((group, groupIndex) => {
              const next = groups[groupIndex + 1];
              const groupEnd = next?.startedAt ?? session.lastSeenAt;
              return (
                <div key={group.id} className="rounded-xl bg-white p-4 dark:bg-slate-900">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                        <Route className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{group.path}</p>
                        <p className="text-xs text-slate-400">
                          {group.startedAt.toLocaleString()} · {formatDuration(group.startedAt, groupEnd)}
                        </p>
                      </div>
                    </div>
                    <span className="badge-slate">
                      {group.events.length} event{group.events.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="ml-10 flex flex-col gap-1.5">
                    {group.events.map((event) => {
                      const Icon = event.type === TrackedEventType.PAGE_VIEW ? Eye : MousePointerClick;
                      return (
                        <div key={event.id} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-slate-900">
                            <Icon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {event.type === TrackedEventType.PAGE_VIEW ? "Page view" : "Click"}
                              </p>
                              <span className="text-xs text-slate-400">{event.createdAt.toLocaleTimeString()}</span>
                            </div>
                            {event.type === TrackedEventType.CLICK ? (
                              <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                                {event.targetLabel || "Unlabeled element"}
                                {event.targetSelector ? ` · ${event.targetSelector}` : ""}
                              </p>
                            ) : (
                              <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{event.path}</p>
                            )}
                            {event.referrer && <p className="mt-1 truncate text-xs text-slate-400">Referrer: {event.referrer}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={value}>
        {value}
      </p>
    </div>
  );
}
