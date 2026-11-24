import { TrackedEventType } from "@prisma/client";
import { MousePointerClick } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HighgardenChrome, RangeLinks, RankRow, SegmentLinks, hrefWith } from "@/components/highgarden/hg-chrome";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { DEVICES, deviceLabel, parseRange, rangeStart } from "@/lib/highgarden";
import { cn } from "@/lib/cn";
import { requireHighgardenPage } from "@/server/highgarden";
import { isDevice } from "@/server/highgarden-data";
import { prisma } from "@/server/prisma";

export const metadata: Metadata = { title: "Heatmaps · Highgarden" };

type SP = { days?: string; path?: string; device?: string };
const BASE = "/dashboard/highgarden/heatmaps";
const COLS = 24;
const ROWS = 15;
const POINT_CAP = 20_000;
const clickTypes = { in: [TrackedEventType.CLICK, TrackedEventType.DEAD_CLICK] };

export default async function HighgardenHeatmapsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireHighgardenPage();
  const sp = await searchParams;
  const range = parseRange(sp.days);
  const since = rangeStart(range.days);
  const device = isDevice(sp.device) ? sp.device : "all";
  const deviceWhere = device !== "all" ? { deviceType: device } : {};

  const pages = await prisma.trackedEvent.groupBy({
    by: ["path"],
    where: { type: clickTypes, createdAt: { gte: since }, xPct: { not: null }, yPct: { not: null }, ...deviceWhere },
    _count: { _all: true },
    orderBy: { _count: { path: "desc" } },
    take: 20,
  });
  const path = sp.path && sp.path.length <= 500 ? sp.path : pages[0]?.path;
  const params = { days: sp.days, device: sp.device, path: sp.path };

  const header = (
    <HighgardenChrome
      section="heatmaps"
      title="Heatmaps"
      description="Where people click on a page, as a share of the visible window. Dead clicks are clicks that did nothing."
      actions={<RangeLinks base={BASE} current={range.key} params={params} />}
    />
  );
  const deviceFilter = (
    <SegmentLinks label="Device" options={[{ value: "all", label: "Any device" }, ...DEVICES.map((d) => ({ value: d, label: deviceLabel(d) }))]} current={device} hrefFor={(v) => hrefWith(BASE, params, { device: v })} />
  );

  if (!path) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div>{deviceFilter}</div>
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState icon={MousePointerClick} title="No clicks recorded in this range" description="Heatmaps fill in as people click around. Try a longer range or another device." />
        </div>
      </div>
    );
  }

  const where = { type: clickTypes, path, createdAt: { gte: since }, ...deviceWhere };
  const [points, elements] = await Promise.all([
    prisma.trackedEvent.findMany({
      where: { ...where, xPct: { not: null }, yPct: { not: null } },
      select: { xPct: true, yPct: true, type: true },
      orderBy: { createdAt: "desc" },
      take: POINT_CAP,
    }),
    prisma.trackedEvent.groupBy({
      by: ["targetLabel", "targetSelector", "type"],
      where,
      _count: { _all: true },
      orderBy: { _count: { targetSelector: "desc" } },
      take: 12,
    }),
  ]);

  const cells = Array.from({ length: COLS * ROWS }, () => ({ n: 0, dead: 0 }));
  for (const p of points) {
    const x = Math.min(COLS - 1, Math.floor(((p.xPct ?? 0) / 100) * COLS));
    const y = Math.min(ROWS - 1, Math.floor(((p.yPct ?? 0) / 100) * ROWS));
    const c = cells[y * COLS + x];
    if (!c) continue;
    c.n += 1;
    if (p.type === TrackedEventType.DEAD_CLICK) c.dead += 1;
  }
  const max = Math.max(1, ...cells.map((c) => c.n));
  const deadTotal = points.filter((p) => p.type === TrackedEventType.DEAD_CLICK).length;
  const elMax = Math.max(1, ...elements.map((e) => e._count._all));

  return (
    <div className="flex flex-col gap-4">
      {header}
      <div>{deviceFilter}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel
          title={<span className="font-mono text-base">{path}</span>}
          description={`${points.length.toLocaleString("en")} click${points.length === 1 ? "" : "s"} with a position${points.length === POINT_CAP ? " (latest 20,000)" : ""}, ${deadTotal.toLocaleString("en")} dead.`}
        >
          <figure className="flex flex-col gap-3">
            <div
              role="img"
              aria-label={`Click density for ${path}. Densest cell has ${max} clicks.`}
              className="relative grid aspect-[16/10] w-full overflow-hidden rounded-control border border-line bg-sunken"
              style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
            >
              {cells.map((c, i) => (
                <div
                  key={i}
                  title={c.n ? `${c.n} click${c.n === 1 ? "" : "s"}${c.dead ? `, ${c.dead} dead` : ""}` : undefined}
                  className={cn("relative", c.dead > 0 && c.dead / c.n >= 0.5 && "outline outline-1 -outline-offset-1 outline-danger")}
                  style={c.n ? { backgroundColor: `color-mix(in oklab, var(--chart-1) ${Math.round(12 + (c.n / max) * 78)}%, transparent)` } : undefined}
                />
              ))}
            </div>
            <figcaption className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-2">
                Fewer
                <span aria-hidden className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in oklab, var(--chart-1) 12%, transparent), var(--chart-1))" }} />
                More
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-[2px] outline outline-1 -outline-offset-1 outline-danger" /> Mostly dead clicks
              </span>
              <span className="text-ink-faint">Positions are relative to the window, not the full page, so long pages blur below the fold.</span>
            </figcaption>
          </figure>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Pages" description="Most-clicked first." bodyClassName="p-2">
            <ul className="flex flex-col">
              {pages.map((p) => (
                <li key={p.path}>
                  <Link
                    href={hrefWith(BASE, params, { path: p.path })}
                    scroll={false}
                    aria-current={p.path === path ? "page" : undefined}
                    className={cn("flex items-center justify-between gap-3 rounded-control px-2.5 py-1.5 text-sm", p.path === path ? "bg-sunken text-ink" : "text-ink-muted hover:bg-sunken hover:text-ink")}
                  >
                    <span className="min-w-0 truncate font-mono">{p.path}</span>
                    <span className="shrink-0 tabular-nums">{p._count._all.toLocaleString("en")}</span>
                  </Link>
                </li>
              ))}
              {!pages.some((p) => p.path === path) && <li className="px-2.5 py-1.5 font-mono text-sm text-ink">{path}</li>}
            </ul>
          </Panel>
          <Panel title="Top targets on this page" bodyClassName="p-2">
            {elements.length === 0 ? (
              <p className="px-2 py-1.5 text-base text-ink-muted">No clicks on this page in this range.</p>
            ) : (
              <ul className="flex flex-col">
                {elements.map((e) => (
                  <RankRow
                    key={`${e.type}|${e.targetSelector}|${e.targetLabel}`}
                    label={`${e.targetLabel || e.targetSelector || "Unlabelled element"}${e.type === TrackedEventType.DEAD_CLICK ? " (dead)" : ""}`}
                    sublabel={e.targetLabel ? (e.targetSelector ?? undefined) : undefined}
                    value={e._count._all}
                    max={elMax}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
