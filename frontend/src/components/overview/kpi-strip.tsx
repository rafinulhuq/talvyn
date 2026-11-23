import Link from "next/link";

export type Kpi = { label: string; value: number; href?: string; hint?: string };

const nf = new Intl.NumberFormat("en");

/** Headline numbers in one strip: hairline dividers, no card per number. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-line gap-px md:grid-cols-4">
      {items.map((k) => {
        const body = (
          <>
            <dt className="text-sm text-ink-muted">{k.label}</dt>
            <dd className="mt-1 text-2xl font-medium tracking-[-0.01em] text-ink">{nf.format(k.value)}</dd>
            {k.hint && <dd className="mt-0.5 text-sm text-ink-muted">{k.hint}</dd>}
          </>
        );
        return k.href ? (
          <Link key={k.label} href={k.href} className="block bg-surface px-5 py-4 transition-colors hover:bg-sunken/60">
            {body}
          </Link>
        ) : (
          <div key={k.label} className="bg-surface px-5 py-4">
            {body}
          </div>
        );
      })}
    </dl>
  );
}
