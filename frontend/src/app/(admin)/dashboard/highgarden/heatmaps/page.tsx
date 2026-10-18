import Link from "next/link";
import { TrackedEventType } from "@prisma/client";
import { MousePointerClick } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";
import { HighgardenSectionHeader } from "../HighgardenSectionHeader";

type SearchParams = {
  days?: string;
  path?: string;
  device?: string;
};

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

function heatColor(count: number, max: number): string {
  const ratio = max > 0 ? count / max : 0;
  if (ratio > 0.75) return "bg-red-500";
  if (ratio > 0.45) return "bg-orange-400";
  if (ratio > 0.2) return "bg-amber-300";
  return "bg-brand-300";
}

function queryHref(next: Partial<SearchParams>, current: Required<SearchParams>): string {
  const params = new URLSearchParams({
    days: current.days,
    path: current.path,
    device: current.device,
  });
  for (const [key, value] of Object.entries(next)) {
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
  }
  return `/dashboard/highgarden/heatmaps?${params.toString()}`;
}

function bucketKey(xPct: number, yPct: number): string {
  const x = Math.min(9, Math.max(0, Math.floor(xPct / 10)));
  const y = Math.min(9, Math.max(0, Math.floor(yPct / 10)));
  return `${x}:${y}`;
}

function resolveHeatmapFilters(params: SearchParams, topPages: Array<{ path: string }>) {
  const days = parseDays(params.days);
  const selectedPreset = params.days === "today" ? "today" : String(days);
  const selectedPath = params.path || topPages[0]?.path || "/dashboard";
  const device = DEVICE_OPTIONS.includes(params.device || "") ? params.device || "all" : "all";
  return { days, selectedPreset, selectedPath, device, filterState: { days: selectedPreset, path: selectedPath, device } };
}

function deviceWhereClause(device: string) {
  return device !== "all" ? { deviceType: device } : {};
}

export default async function HighgardenHeatmapsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireHighgardenAccess();
  const params = await searchParams;
  const rawDays = parseDays(params.days);
  const since = startDate(rawDays);

  const topPages = await prisma.trackedEvent.groupBy({
    by: ["path"],
    where: {
      type: { in: [TrackedEventType.CLICK, TrackedEventType.DEAD_CLICK] },
      createdAt: { gte: since },
      xPct: { not: null },
      yPct: { not: null },
    },
    _count: { _all: true },
    orderBy: { _count: { path: "desc" } },
    take: 20,
  });
  const { selectedPreset, selectedPath, device, filterState } = resolveHeatmapFilters(params, topPages);

  const [points, topElements] = await Promise.all([
    prisma.trackedEvent.findMany({
      where: {
        type: { in: [TrackedEventType.CLICK, TrackedEventType.DEAD_CLICK] },
        path: selectedPath,
        createdAt: { gte: since },
        xPct: { not: null },
        yPct: { not: null },
        ...deviceWhereClause(device),
      },
      select: { xPct: true, yPct: true, type: true },
      take: 5000,
    }),
    prisma.trackedEvent.groupBy({
      by: ["targetLabel", "targetSelector"],
      where: {
        type: { in: [TrackedEventType.CLICK, TrackedEventType.DEAD_CLICK] },
        path: selectedPath,
        createdAt: { gte: since },
        ...deviceWhereClause(device),
      },
      _count: { _all: true },
      orderBy: { _count: { targetLabel: "desc" } },
      take: 12,
    }),
  ]);

  const buckets = new Map<string, { count: number; dead: number }>();
  for (const point of points) {
    if (point.xPct === null || point.yPct === null) continue;
    const key = bucketKey(point.xPct, point.yPct);
    const current = buckets.get(key) ?? { count: 0, dead: 0 };
    current.count += 1;
    if (point.type === TrackedEventType.DEAD_CLICK) current.dead += 1;
    buckets.set(key, current);
  }
  const maxBucket = Math.max(1, ...[...buckets.values()].map((value) => value.count));

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <HighgardenSectionHeader
          title="Heatmaps"
          description="Aggregated click density by page. No screenshots or DOM snapshots are stored."
        />
        <div className="flex gap-2">
          {[
            { value: "today", label: "Today" },
            { value: "7", label: "7d" },
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
          ].map((preset) => (
            <Link key={preset.value} href={queryHref({ days: preset.value }, filterState)} className={pillClass(selectedPreset === preset.value)}>
              {preset.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <TopPagesFilterList topPages={topPages} selectedPath={selectedPath} filterState={filterState} />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Device</p>
            <div className="flex flex-wrap gap-1">
              {DEVICE_OPTIONS.map((value) => (
                <Link key={value} href={queryHref({ device: value }, filterState)} className={inCardPillClass(device === value)}>
                  {value === "all" ? "All devices" : value}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Click density</h2>
              <p className="break-all text-xs text-slate-500 dark:text-slate-400">{selectedPath}</p>
            </div>
            <span className="badge-slate">{points.length.toLocaleString()} points</span>
          </div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-white dark:bg-slate-900">
            <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
              {Array.from({ length: 100 }, (_, index) => {
                const x = index % 10;
                const y = Math.floor(index / 10);
                const bucket = buckets.get(`${x}:${y}`);
                const opacity = bucket ? Math.max(0.28, bucket.count / maxBucket) : 0;
                return (
                  <div key={`${x}:${y}`} className="border border-slate-100 dark:border-slate-800">
                    {bucket && (
                      <div
                        className={`h-full w-full ${heatColor(bucket.count, maxBucket)}`}
                        style={{ opacity }}
                        title={`${bucket.count} clicks${bucket.dead ? `, ${bucket.dead} dead clicks` : ""}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="absolute left-4 top-4 rounded-md bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-white dark:bg-white/90 dark:text-slate-900">
              Normalized viewport grid
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
          <div className="mb-4 flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Top clicked elements</h2>
          </div>
          <TopClickedElementsList topElements={topElements} />
        </section>
      </div>
    </div>
  );
}

type TopPageRow = { path: string; _count: { _all: number } };
type TopElementRow = { targetLabel: string | null; targetSelector: string | null; _count: { _all: number } };

function TopPagesFilterList({
  topPages,
  selectedPath,
  filterState,
}: {
  topPages: TopPageRow[];
  selectedPath: string;
  filterState: Required<SearchParams>;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Page</p>
      <div className="flex flex-wrap gap-1">
        {topPages.length === 0 ? (
          <span className="text-sm text-slate-500 dark:text-slate-400">No click coordinates recorded yet.</span>
        ) : (
          topPages.map((row) => (
            <Link key={row.path} href={queryHref({ path: row.path }, filterState)} className={inCardPillClass(selectedPath === row.path)}>
              {row.path} ({row._count._all})
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function TopClickedElementsList({ topElements }: { topElements: TopElementRow[] }) {
  if (topElements.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No clicked elements for this page and filter.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {topElements.map((row) => (
        <div key={`${row.targetSelector}:${row.targetLabel}`} className="rounded-xl bg-white p-3 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {row.targetLabel || row.targetSelector || "Unknown element"}
            </p>
            <span className="badge-slate shrink-0">{row._count._all.toLocaleString()}</span>
          </div>
          {row.targetSelector && <p className="mt-1 truncate text-xs text-slate-400">{row.targetSelector}</p>}
        </div>
      ))}
    </div>
  );
}

function pillClass(selected: boolean): string {
  return selected
    ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
    : "rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
}

function inCardPillClass(selected: boolean): string {
  return selected
    ? "max-w-full truncate rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
    : "max-w-full truncate rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-900/60";
}
