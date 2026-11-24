import type { Prisma } from "@prisma/client";
import { TrackedEventType } from "@prisma/client";
import { Route } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HighgardenChrome, RangeLinks, SegmentLinks, hrefWith } from "@/components/highgarden/hg-chrome";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SearchParamInput } from "@/components/ui/search-param-input";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import { AREAS, DEVICES, deviceLabel, areaLabel, formatDuration, parseRange, rangeStart } from "@/lib/highgarden";
import { requireHighgardenPage } from "@/server/highgarden";
import { areaWhere, isDevice } from "@/server/highgarden-data";
import { prisma } from "@/server/prisma";

export const metadata: Metadata = { title: "Sessions · Highgarden" };

type SP = { days?: string; area?: string; type?: string; device?: string; q?: string; page?: string };
const BASE = "/dashboard/highgarden/sessions";
const PAGE_SIZE = 25;
const TYPES = [
  { value: "all", label: "Any event" },
  { value: TrackedEventType.CLIENT_ERROR, label: "Errors" },
  { value: TrackedEventType.DEAD_CLICK, label: "Dead clicks" },
  { value: TrackedEventType.CLICK, label: "Clicks" },
];

export default async function HighgardenSessionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireHighgardenPage();
  const sp = await searchParams;
  const range = parseRange(sp.days);
  const area = AREAS.some((a) => a.key === sp.area) ? sp.area! : "all";
  const type = TYPES.some((t) => t.value === sp.type) ? sp.type! : "all";
  const device = isDevice(sp.device) ? sp.device : "all";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const clauses: Prisma.TrackedEventWhereInput[] = [];
  const a = areaWhere(area);
  if (a) clauses.push(a);
  if (type !== "all") clauses.push({ type: type as TrackedEventType });
  if (device !== "all") clauses.push({ deviceType: device });
  if (q) {
    clauses.push({
      OR: [
        { path: { contains: q, mode: "insensitive" } },
        { targetLabel: { contains: q, mode: "insensitive" } },
        { targetSelector: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.VisitorSessionWhereInput = {
    lastSeenAt: { gte: rangeStart(range.days) },
    ...(clauses.length ? { events: { some: { AND: clauses } } } : {}),
  };

  const [total, sessions] = await Promise.all([
    prisma.visitorSession.count({ where }),
    prisma.visitorSession.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { events: true } },
        events: {
          orderBy: { createdAt: "asc" },
          take: 200,
          select: { type: true, path: true, targetSelector: true, targetLabel: true, createdAt: true, deviceType: true, browserName: true, osName: true, country: true },
        },
      },
    }),
  ]);

  const params = { days: sp.days, area: sp.area, type: sp.type, device: sp.device, q: sp.q };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <HighgardenChrome
        section="sessions"
        title="Sessions"
        description="One row per anonymous visitor. Open a session to see every page and click in order."
        actions={<RangeLinks base={BASE} current={range.key} params={{ ...params, page: undefined }} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchParamInput label="Search sessions" placeholder="Path, button label or selector" />
        <SegmentLinks label="Area" options={[{ value: "all", label: "All areas" }, ...AREAS.map((x) => ({ value: x.key, label: x.label }))]} current={area} hrefFor={(v) => hrefWith(BASE, params, { area: v, page: undefined })} />
        <SegmentLinks label="Event type" options={TYPES} current={type} hrefFor={(v) => hrefWith(BASE, params, { type: v, page: undefined })} />
        <SegmentLinks label="Device" options={[{ value: "all", label: "Any device" }, ...DEVICES.map((d) => ({ value: d, label: deviceLabel(d) }))]} current={device} hrefFor={(v) => hrefWith(BASE, params, { device: v, page: undefined })} />
      </div>

      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        {sessions.length === 0 ? (
          <EmptyState icon={Route} title="No sessions match" description="Widen the date range or clear a filter." />
        ) : (
          <Table aria-label="Visitor sessions">
            <THead>
              <tr>
                <TH>Journey</TH>
                <TH>Area</TH>
                <TH>Device</TH>
                <TH className="text-right">Events</TH>
                <TH className="text-right">Duration</TH>
                <TH>Signals</TH>
                <TH className="text-right">Last seen</TH>
              </tr>
            </THead>
            <tbody>
              {sessions.map((s) => {
                const views = s.events.filter((e) => e.type === TrackedEventType.PAGE_VIEW);
                const entry = views[0]?.path ?? s.events[0]?.path ?? "—";
                const exit = views.at(-1)?.path ?? s.events.at(-1)?.path ?? entry;
                const first = s.events[0]?.createdAt ?? s.firstSeenAt;
                const last = s.events.at(-1)?.createdAt ?? s.lastSeenAt;
                const meta = s.events.find((e) => e.browserName || e.deviceType);
                const errors = s.events.filter((e) => e.type === TrackedEventType.CLIENT_ERROR).length;
                const dead = s.events.filter((e) => e.type === TrackedEventType.DEAD_CLICK).length;
                return (
                  <TR key={s.id} className="relative">
                    <TD className="max-w-80">
                      <Link href={`${BASE}/${s.id}${sp.days ? `?days=${sp.days}` : ""}`} className="block truncate font-mono text-sm text-ink after:absolute after:inset-0 hover:text-accent">
                        {entry}
                      </Link>
                      <span className="block truncate font-mono text-xs text-ink-muted">
                        {views.length > 1 ? `→ ${exit} · ${views.length} pages` : "1 page"}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-muted">{areaLabel(entry)}</TD>
                    <TD className="whitespace-nowrap text-ink-muted">
                      <span>{deviceLabel(meta?.deviceType ?? "unknown")}</span>
                      {meta?.browserName && <span className="block text-sm text-ink-muted">{[meta.browserName, meta.osName, meta.country].filter(Boolean).join(" · ")}</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{s._count.events.toLocaleString("en")}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatDuration(last.getTime() - first.getTime())}</TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        {errors > 0 && <Badge tone="danger">{errors} error{errors === 1 ? "" : "s"}</Badge>}
                        {dead > 0 && <Badge tone="warning">{dead} dead click{dead === 1 ? "" : "s"}</Badge>}
                        {errors + dead === 0 && <span className="text-sm text-ink-muted">None</span>}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-right text-ink-muted">{formatRelative(s.lastSeenAt.toISOString())}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
      {total > PAGE_SIZE && <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} href={(p) => hrefWith(BASE, params, { page: p === 1 ? undefined : String(p) })} />}
    </div>
  );
}
