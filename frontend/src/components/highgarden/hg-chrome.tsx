import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { RANGES, type RangeKey } from "@/lib/highgarden";
import { cn } from "@/lib/cn";
import { LockButton } from "./lock-button";

const SECTIONS = [
  { id: "overview", label: "Overview", href: "/dashboard/highgarden" },
  { id: "sessions", label: "Sessions", href: "/dashboard/highgarden/sessions" },
  { id: "funnels", label: "Funnels", href: "/dashboard/highgarden/funnels" },
  { id: "heatmaps", label: "Heatmaps", href: "/dashboard/highgarden/heatmaps" },
  { id: "feedback", label: "Feedback", href: "/dashboard/highgarden/feedback" },
  { id: "alerts", label: "Alerts", href: "/dashboard/highgarden/alerts" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

/** Builds a URL from current params plus overrides; "" or "all" removes a key. */
export function hrefWith(base: string, current: Record<string, string | undefined>, next: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...next })) if (v && v !== "all") p.set(k, v);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Page header + section tabs shared by every unlocked Highgarden page. */
export function HighgardenChrome({
  section,
  title,
  description,
  actions,
  crumbs,
}: {
  section: SectionId;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <PageHeader
        title={title}
        description={description}
        crumbs={crumbs ?? [{ label: "Highgarden", href: "/dashboard/highgarden" }, { label: SECTIONS.find((s) => s.id === section)?.label ?? title }]}
        actions={
          <>
            {actions}
            <LockButton />
          </>
        }
        className="pb-3"
      />
      <nav aria-label="Highgarden sections" className="mb-5 border-b border-line">
        <ul className="-mb-px flex gap-x-5 overflow-x-auto">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <Link
                href={s.href}
                aria-current={s.id === section ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center whitespace-nowrap border-b-2 text-base",
                  s.id === section ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Segmented link group, e.g. the date range or a filter. */
export function SegmentLinks({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  current: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 max-w-full items-center overflow-x-auto rounded-control border border-line bg-surface p-0.5">
      {options.map((o) => (
        <Link
          key={o.value}
          href={hrefFor(o.value)}
          scroll={false}
          aria-current={o.value === current ? "true" : undefined}
          className={cn(
            "inline-flex h-full items-center whitespace-nowrap rounded-[3px] px-2.5 text-sm transition-colors",
            o.value === current ? "bg-sunken font-medium text-ink" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function RangeLinks({ base, current, params }: { base: string; current: RangeKey; params: Record<string, string | undefined> }) {
  return (
    <SegmentLinks
      label="Date range"
      options={RANGES.map((r) => ({ value: r.key, label: r.key === "today" ? "Today" : `${r.key}d` }))}
      current={current}
      // 30 is the default, so it's left out of the URL.
      hrefFor={(v) => hrefWith(base, params, { days: v === "30" ? undefined : v })}
    />
  );
}

/** A label + number tile. Numbers are tabular so columns line up. */
export function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: ReactNode; tone?: "danger" | "warning" }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={cn("text-xl font-medium tabular-nums tracking-[-0.01em]", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink")}>
        {typeof value === "number" ? value.toLocaleString("en") : value}
      </span>
      {hint && <span className="text-sm text-ink-faint">{hint}</span>}
    </div>
  );
}

/** Hairline-separated row of stats (1px gaps over the line colour, no shadows). */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-panel border border-line bg-line", className)}>{children}</div>;
}

/** Ranked list row with a proportional bar behind the count. */
export function RankRow({ label, sublabel, value, max, href }: { label: string; sublabel?: string; value: number; max: number; href?: string }) {
  const body = (
    <>
      <span aria-hidden className="absolute inset-y-1 left-0 rounded-[3px] bg-accent-soft" style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }} />
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-base text-ink">{label}</span>
        {sublabel && <span className="block truncate font-mono text-xs text-ink-muted">{sublabel}</span>}
      </span>
      <span className="relative shrink-0 text-base tabular-nums text-ink">{value.toLocaleString("en")}</span>
    </>
  );
  const cls = "relative flex items-center gap-4 px-2 py-1.5";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(cls, "rounded-control hover:bg-sunken")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
