"use client";

import { useId, useMemo, useState } from "react";
import type { TimelinePoint } from "@/types/stats";

const W = 640;
const H = 180;
const PAD = { top: 12, right: 72, bottom: 24, left: 32 };
const SERIES = [
  { key: "submitted", label: "Tests submitted", color: "var(--chart-1)" },
  { key: "invitations", label: "Invitations sent", color: "var(--chart-2)" },
] as const;

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso));

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

/**
 * Two series over time on ONE axis. Lines (2px), direct end labels plus a
 * legend, crosshair tooltip on hover/focus, and a table for screen readers.
 */
export function ActivityChart({ points }: { points: TimelinePoint[] }) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...points.flatMap((p) => [p.submitted, p.invitations])));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];

  const paths = useMemo(
    () =>
      SERIES.map((s) => ({
        ...s,
        d: points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join(" "),
        last: points.at(-1)?.[s.key] ?? 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x/y are pure functions of points and max
    [points, max],
  );

  const hp = hover !== null ? points[hover] : null;

  return (
    <figure aria-labelledby={titleId} className="flex flex-col gap-3">
      <figcaption id={titleId} className="sr-only">
        Invitations sent and tests submitted per day, last {points.length} days
      </figcaption>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted" aria-hidden>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-hidden onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px]">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % Math.ceil(points.length / 7) === 0 || i === points.length - 1 ? (
              <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-muted text-[11px]">
                {dayLabel(p.date)}
              </text>
            ) : null,
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--line-strong)" strokeWidth={1} />}
          {paths.map((s) => (
            <g key={s.key}>
              <path d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <text x={x(points.length - 1) + 8} y={y(s.last)} dy="0.32em" className="fill-ink text-[11px]">
                {s.last} {s.key === "submitted" ? "submitted" : "invited"}
              </text>
              {hover !== null && hp && (
                <circle cx={x(hover)} cy={y(hp[s.key])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              )}
            </g>
          ))}
          {/* Hit targets: one column per day, wider than the mark. */}
          {points.map((p, i) => (
            <rect
              key={p.date}
              x={x(i) - iw / Math.max(1, points.length - 1) / 2}
              y={PAD.top}
              width={iw / Math.max(1, points.length - 1)}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hp && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-menu border border-line bg-surface px-3 py-2 text-sm shadow-float"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <p className="font-medium text-ink">{dayLabel(hp.date)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="mt-0.5 flex items-center justify-between gap-4 text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-medium text-ink">{hp[s.key]}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Invitations sent</th>
            <th scope="col">Tests started</th>
            <th scope="col">Tests submitted</th>
            <th scope="col">Graded</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{dayLabel(p.date)}</th>
              <td>{p.invitations}</td>
              <td>{p.started}</td>
              <td>{p.submitted}</td>
              <td>{p.evaluated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
