import Link from "next/link";
import { Prisma, TrackedEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";

type SearchParams = {
  days?: string;
  area?: string;
  type?: string;
  device?: string;
  q?: string;
};

const AREA_OPTIONS = [
  { value: "all", label: "All areas" },
  { value: "admin", label: "Admin" },
  { value: "candidate_exam", label: "Candidate exam" },
  { value: "candidate_apply", label: "Apply" },
  { value: "blog", label: "Blog" },
  { value: "public", label: "Public" },
];

const DEVICE_OPTIONS = ["all", "desktop", "tablet", "mobile", "unknown"];

function startDate(days: number): Date {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (days === 1) date.setHours(0, 0, 0, 0);
  return date;
}

function parseDays(raw: string | undefined): number {
  if (raw === "today") return 1;
  if (raw === "90") return 90;
  if (raw === "7") return 7;
  return 30;
}

function areaWhere(area: string): Prisma.TrackedEventWhereInput | null {
  if (area === "admin") return { path: { startsWith: "/dashboard" } };
  if (area === "candidate_exam") {
    return { OR: [{ path: { startsWith: "/tests" } }, { path: { startsWith: "/test" } }, { path: { startsWith: "/exam" } }] };
  }
  if (area === "candidate_apply") return { path: { startsWith: "/apply" } };
  if (area === "blog") return { path: { startsWith: "/blog" } };
  if (area === "public") {
    return {
      NOT: {
        OR: [
          { path: { startsWith: "/dashboard" } },
          { path: { startsWith: "/tests" } },
          { path: { startsWith: "/test" } },
          { path: { startsWith: "/exam" } },
          { path: { startsWith: "/apply" } },
          { path: { startsWith: "/blog" } },
        ],
      },
    };
  }
  return null;
}

function eventWhere(filters: {
  area: string;
  type: string;
  device: string;
  q: string;
}): Prisma.TrackedEventWhereInput {
  const clauses: Prisma.TrackedEventWhereInput[] = [];
  const areaClause = areaWhere(filters.area);
  if (areaClause) clauses.push(areaClause);
  if (filters.type === TrackedEventType.PAGE_VIEW || filters.type === TrackedEventType.CLICK) {
    clauses.push({ type: filters.type });
  }
  if (filters.device !== "all") clauses.push({ deviceType: filters.device });
  if (filters.q) {
    clauses.push({
      OR: [
        { path: { contains: filters.q, mode: "insensitive" } },
        { targetLabel: { contains: filters.q, mode: "insensitive" } },
        { targetSelector: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  return clauses.length ? { AND: clauses } : {};
}

function queryHref(next: Partial<SearchParams>, current: Required<SearchParams>): string {
  const params = new URLSearchParams({
    days: current.days,
    area: current.area,
    type: current.type,
    device: current.device,
  });
  if (current.q) params.set("q", current.q);
  for (const [key, value] of Object.entries(next)) {
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
  }
  return `/dashboard/highgarden/sessions?${params.toString()}`;
}

function formatDuration(start: Date, end: Date): string {
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function areaLabel(path: string): string {
  if (path.startsWith("/dashboard")) return "Admin";
  if (path.startsWith("/tests") || path.startsWith("/test") || path.startsWith("/exam")) return "Candidate exam";
  if (path.startsWith("/apply")) return "Apply";
  if (path.startsWith("/blog")) return "Blog";
  return "Public";
}

function repeatedClickCount(
  events: { type: TrackedEventType; targetSelector: string | null; targetLabel: string | null }[]
): number {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.type !== TrackedEventType.CLICK) continue;
    const key = event.targetSelector || event.targetLabel;
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

export default async function HighgardenSessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireHighgardenAccess();
  const params = await searchParams;
  const days = parseDays(params.days);
  const selectedPreset = params.days === "today" ? "today" : String(days);
  const filters = {
    days: selectedPreset,
    area: params.area || "all",
    type: params.type || "all",
    device: params.device || "all",
    q: (params.q || "").trim(),
  };
  const since = startDate(days);
  const matchingEvents = eventWhere(filters);

  const sessions = await prisma.visitorSession.findMany({
    where: {
      lastSeenAt: { gte: since },
      ...(Object.keys(matchingEvents).length ? { events: { some: matchingEvents } } : {}),
    },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
    include: {
      _count: { select: { events: true } },
      events: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          type: true,
          path: true,
          targetLabel: true,
          targetSelector: true,
          createdAt: true,
          deviceType: true,
          browserName: true,
          osName: true,
        },
      },
    },
  });

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/highgarden" className="text-sm font-medium text-brand-600 dark:text-brand-400">
            Back to Highgarden
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Visitor sessions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Session journeys with entry/exit pages, devices, and friction hints.</p>
        </div>
        <div className="flex gap-2">
          {[
            { value: "today", label: "Today" },
            { value: "7", label: "7d" },
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
          ].map((preset) => (
            <Link key={preset.value} href={queryHref({ days: preset.value }, filters)} className={pillClass(selectedPreset === preset.value)}>
              {preset.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <FilterLinks label="Area" options={AREA_OPTIONS} current={filters.area} hrefFor={(value) => queryHref({ area: value }, filters)} />
          <FilterLinks
            label="Event"
            options={[
              { value: "all", label: "All events" },
              { value: TrackedEventType.PAGE_VIEW, label: "Page views" },
              { value: TrackedEventType.CLICK, label: "Clicks" },
            ]}
            current={filters.type}
            hrefFor={(value) => queryHref({ type: value }, filters)}
          />
          <FilterLinks
            label="Device"
            options={DEVICE_OPTIONS.map((value) => ({ value, label: value === "all" ? "All devices" : value }))}
            current={filters.device}
            hrefFor={(value) => queryHref({ device: value }, filters)}
          />
          <form className="flex flex-col gap-1" action="/dashboard/highgarden/sessions">
            <input type="hidden" name="days" value={filters.days} />
            <input type="hidden" name="area" value={filters.area} />
            <input type="hidden" name="type" value={filters.type} />
            <input type="hidden" name="device" value={filters.device} />
            <label htmlFor="hg-session-q" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Search
            </label>
            <input
              id="hg-session-q"
              name="q"
              defaultValue={filters.q}
              placeholder="Path, label, selector"
              className="h-9 rounded-lg bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-100 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-brand-900"
            />
          </form>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
        {sessions.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No sessions match these filters.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((session) => {
              const pageViews = session.events.filter((event) => event.type === TrackedEventType.PAGE_VIEW);
              const entry = pageViews[0] ?? session.events[0];
              const exit = pageViews.at(-1) ?? session.events.at(-1);
              const device = session.events.find((event) => event.deviceType)?.deviceType || "unknown";
              const browser = session.events.find((event) => event.browserName)?.browserName;
              const os = session.events.find((event) => event.osName)?.osName;
              const repeatedClicks = repeatedClickCount(session.events);
              const hasFriction = repeatedClicks >= 3;

              return (
                <Link
                  key={session.id}
                  href={`/dashboard/highgarden/sessions/${session.id}`}
                  className="grid gap-3 rounded-xl bg-white p-4 transition-colors duration-150 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 lg:grid-cols-[1.4fr_1fr_1fr_120px_100px]"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{session.id}</p>
                      {hasFriction && <span className="badge-yellow">repeated clicks</span>}
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">Entry: {entry?.path || "Unknown"}</p>
                    <p className="truncate text-xs text-slate-400">Exit: {exit?.path || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Area</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{entry ? areaLabel(entry.path) : "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Device</p>
                    <p className="text-sm font-medium capitalize text-slate-700 dark:text-slate-300">{device}</p>
                    {(browser || os) && <p className="text-xs text-slate-400">{[browser, os].filter(Boolean).join(" / ")}</p>}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Duration</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDuration(session.firstSeenAt, session.lastSeenAt)}</p>
                    <p className="text-xs text-slate-400">{session._count.events} events</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last seen</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{session.lastSeenAt.toLocaleString()}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function pillClass(selected: boolean): string {
  return selected
    ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
    : "rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
}

function FilterLinks({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: { value: string; label: string }[];
  current: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            className={
              current === option.value
                ? "rounded-full bg-white px-2.5 py-1 text-xs font-medium capitalize text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                : "rounded-full px-2.5 py-1 text-xs font-medium capitalize text-slate-500 transition-colors duration-150 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-900/60"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
