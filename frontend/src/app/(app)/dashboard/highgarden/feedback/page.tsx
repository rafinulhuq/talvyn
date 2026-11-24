import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackActions } from "@/components/highgarden/feedback-actions";
import { HighgardenChrome, SegmentLinks, Stat, StatGrid, hrefWith } from "@/components/highgarden/hg-chrome";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatRelative } from "@/lib/format";
import { FEEDBACK_STATUSES, rangeStart, type FeedbackStatus } from "@/lib/highgarden";
import { requireHighgardenPage } from "@/server/highgarden";
import { prisma } from "@/server/prisma";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Feedback · Highgarden" };

type SP = { status?: string; page?: string };
const BASE = "/dashboard/highgarden/feedback";
const PAGE_SIZE = 25;
const STATUS_LABEL: Record<FeedbackStatus, string> = { UNREAD: "Unread", READ: "Read", ARCHIVED: "Archived" };

export default async function HighgardenFeedbackPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireHighgardenPage();
  const sp = await searchParams;
  // Default view hides archived items; "all" shows everything.
  const status = (FEEDBACK_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as FeedbackStatus) : sp.status === "all" ? "all" : "open";
  const where = status === "all" ? {} : status === "open" ? { status: { in: ["UNREAD", "READ"] } } : { status };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [items, filtered, counts, avg] = await Promise.all([
    prisma.highgardenFeedback.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.highgardenFeedback.count({ where }),
    prisma.highgardenFeedback.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.highgardenFeedback.aggregate({ _avg: { rating: true }, _count: { _all: true }, where: { createdAt: { gte: rangeStart(30) } } }),
  ]);
  const count = (s: FeedbackStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const params = { status: sp.status };

  return (
    <div className="flex flex-col gap-4">
      <HighgardenChrome section="feedback" title="Feedback" description="What people sent from the feedback button. It's anonymous, linked only to a visitor session." />

      <StatGrid className="grid-cols-2 md:grid-cols-4">
        <Stat label="Unread" value={count("UNREAD")} />
        <Stat label="Read" value={count("READ")} />
        <Stat label="Archived" value={count("ARCHIVED")} />
        <Stat label="Average rating, 30 days" value={avg._avg.rating ? `${avg._avg.rating.toFixed(1)} / 5` : "—"} hint={`${avg._count._all.toLocaleString("en")} responses`} />
      </StatGrid>

      <div>
        <SegmentLinks
          label="Status"
          options={[
            { value: "open", label: "Inbox" },
            { value: "UNREAD", label: "Unread" },
            { value: "ARCHIVED", label: "Archived" },
            { value: "all", label: "All" },
          ]}
          current={status}
          // Status is the only filter, and changing it resets the page.
          hrefFor={(v) => (v === "open" ? BASE : `${BASE}?status=${v}`)}
        />
      </div>

      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        {items.length === 0 ? (
          <EmptyState icon={MessageSquare} title={status === "UNREAD" ? "You're all caught up" : "No feedback here"} description="Feedback appears when someone uses the Feedback button on any page outside a test." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((f) => (
              <li key={f.id} className={cn("flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start", f.status === "UNREAD" && "bg-accent-soft/30")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {f.status === "UNREAD" && <span aria-label="Unread" className="size-2 rounded-full bg-accent" />}
                    <Badge tone={f.rating <= 2 ? "danger" : f.rating === 3 ? "warning" : "success"}>{f.rating}/5</Badge>
                    <span className="text-base font-medium text-ink">{f.category}</span>
                    <span className="font-mono text-xs text-ink-muted">{f.path}</span>
                    {f.status === "ARCHIVED" && <Badge>{STATUS_LABEL.ARCHIVED}</Badge>}
                  </div>
                  {f.comment ? <p className="mt-1.5 whitespace-pre-wrap text-base text-ink">{f.comment}</p> : <p className="mt-1.5 text-base italic text-ink-faint">No comment</p>}
                  <p className="mt-1.5 text-sm text-ink-muted">
                    <time dateTime={f.createdAt.toISOString()} title={formatDateTime(f.createdAt.toISOString())}>
                      {formatRelative(f.createdAt.toISOString())}
                    </time>
                    {f.sessionId && (
                      <>
                        {" · "}
                        <Link href={`/dashboard/highgarden/sessions/${f.sessionId}`} className="text-accent hover:underline">
                          View session
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <FeedbackActions id={f.id} status={f.status as FeedbackStatus} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {filtered > PAGE_SIZE && (
        <Pagination page={page} totalPages={Math.ceil(filtered / PAGE_SIZE)} total={filtered} pageSize={PAGE_SIZE} href={(p) => hrefWith(BASE, params, { page: p === 1 ? undefined : String(p) })} />
      )}
    </div>
  );
}
