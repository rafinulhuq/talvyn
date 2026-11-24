export type TrendPoint = { day: string; views: number; clicks: number };

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Daily page views and clicks as paired bars. Plain HTML/CSS (no chart
 * library); a visually hidden table carries the same numbers for screen readers.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.views, p.clicks)));
  const step = Math.max(1, Math.ceil(points.length / 8));
  return (
    <figure className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-1" /> Page views
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-2" /> Clicks
        </span>
        <span className="ml-auto tabular-nums text-ink-faint">Peak {max.toLocaleString("en")} / day</span>
      </div>
      <div aria-hidden className="flex h-40 items-end gap-[3px] border-b border-line">
        {points.map((p) => (
          <div key={p.day} title={`${dayLabel(p.day)}: ${p.views} views, ${p.clicks} clicks`} className="group flex h-full min-w-0 flex-1 items-end justify-center gap-px">
            <div className="w-full max-w-3 rounded-t-[2px] bg-chart-1 group-hover:opacity-80" style={{ height: `${(p.views / max) * 100}%` }} />
            <div className="w-full max-w-3 rounded-t-[2px] bg-chart-2 group-hover:opacity-80" style={{ height: `${(p.clicks / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden className="flex gap-[3px] text-xs tabular-nums text-ink-faint">
        {points.map((p, i) => (
          // On phones, show every other label so dates don't collide.
          <span key={p.day} className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-center ${i % (step * 2) !== 0 ? "max-sm:invisible" : ""}`}>
            {i % step === 0 ? dayLabel(p.day) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Daily page views and clicks (UTC days)</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Page views</th>
            <th>Clicks</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td>{dayLabel(p.day)}</td>
              <td>{p.views}</td>
              <td>{p.clicks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
