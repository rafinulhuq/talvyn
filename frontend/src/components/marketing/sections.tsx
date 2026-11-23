import { ArrowRight, BarChart3, Brain, CircleCheck, Clock, Code2, FileText, Layers, Shield, Sparkles, Target, TrendingUp, Trophy, Users, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fullTitle, type HomeContent } from "@/lib/cms/site-content";
import { formatDate } from "@/lib/format";
import type { PublicPostSummary } from "@/types/blog";
import { Href } from "./chrome";
import { ExampleReport } from "./example-report";

const ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  trophy: Trophy,
  shield: Shield,
  "bar-chart": BarChart3,
  "file-text": FileText,
  brain: Brain,
  users: Users,
  code: Code2,
  target: Target,
  sparkles: Sparkles,
  clock: Clock,
  layers: Layers,
  "trending-up": TrendingUp,
  "check-circle": CircleCheck,
  "arrow-right": ArrowRight,
};
const Icon = ({ name, className }: { name: string; className?: string }) => {
  const I = ICONS[name] ?? Sparkles;
  return <I aria-hidden className={className} />;
};

/** Section frame: left-aligned heading on a hairline, content below. */
function Section({ id, eyebrow, title, body, children }: { id?: string; eyebrow?: string; title: string; body?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            {eyebrow && <p className="text-base text-ink-muted">{eyebrow}</p>}
            <h2 id={id ? `${id}-title` : undefined} className="mt-2 font-serif text-3xl tracking-[-0.01em] text-ink sm:text-[3.25rem] sm:leading-[1.05]">
              {title}
            </h2>
          </div>
          {body && <p className="max-w-[60ch] self-end text-md text-ink-muted lg:pb-2">{body}</p>}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

export function Hero({ c }: { c: HomeContent["hero"] }) {
  const title = [c.titlePrefix, c.titleHighlight].map((s) => s.trim()).filter(Boolean).join(" ");
  return (
    <section aria-labelledby="hero-title">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          {c.eyebrow && <p className="text-base text-ink-muted">{c.eyebrow}</p>}
          <h1 id="hero-title" className="mt-3 font-serif text-[2.75rem] leading-[1.02] tracking-[-0.015em] text-ink sm:text-display">
            {title}
          </h1>
          {c.body && <p className="mt-6 max-w-[58ch] text-md text-ink-muted">{c.body}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <Href link={c.primaryCta} className="inline-flex h-11 items-center rounded-control bg-accent px-5 text-md font-medium text-accent-ink hover:bg-accent-hover" />
            <Href link={c.secondaryCta} className="inline-flex h-11 items-center rounded-control border border-line-strong bg-surface px-5 text-md font-medium text-ink hover:bg-sunken" />
          </div>
          {c.helperText && <p className="mt-5 max-w-[58ch] text-sm text-ink-muted">{c.helperText}</p>}
        </div>
        <ExampleReport />
      </div>
    </section>
  );
}

export function TrustedBy({ c }: { c: HomeContent["trustedBy"] }) {
  if (!c.companies.length) return null;
  return (
    <section aria-label={c.eyebrow} className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-3 px-5 py-8 sm:px-8">
        <p className="text-base text-ink-muted">{c.eyebrow}</p>
        {c.companies.map((name) => (
          <span key={name} className="text-md font-medium text-ink">
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}

export function Stats({ c }: { c: HomeContent["stats"] }) {
  if (!c.length) return null;
  return (
    <section aria-label="In numbers" className="border-t border-line">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
        {c.map((s) => (
          <div key={s.label} className="border-l border-line py-8 pl-5 first:border-l-0 first:pl-0">
            <dt className="text-base text-ink-muted">{s.label}</dt>
            <dd className="mt-1 font-serif text-[2.75rem] leading-none text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HowItWorks({ c }: { c: HomeContent["howItWorks"] }) {
  if (!c.steps.length) return null;
  return (
    <Section id="how-it-works" eyebrow={c.eyebrow} title={fullTitle(c)} body={c.body}>
      {/* A real sequence, so the numbers carry meaning. */}
      <ol className="grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {c.steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 bg-surface p-6">
            <span className="font-mono text-sm text-ink-muted">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="text-md font-medium text-ink">{s.title}</h3>
            <p className="text-base text-ink-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      {c.media?.src && (
        <figure className="mt-10 overflow-hidden rounded-panel border border-line bg-surface">
          {c.media.type === "video" ? (
            <video src={c.media.src} poster={c.media.poster} controls preload="metadata" className="w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- CMS media; host not known at build time
            <img src={c.media.src} alt={c.media.caption ?? ""} className="w-full" />
          )}
          {c.media.caption && <figcaption className="border-t border-line px-5 py-3 text-sm text-ink-muted">{c.media.caption}</figcaption>}
        </figure>
      )}
    </Section>
  );
}

export function TestTypes({ c }: { c: HomeContent["assessmentTypes"] }) {
  if (!c.items.length) return null;
  return (
    <Section id="test-types" eyebrow={c.eyebrow} title={fullTitle(c)} body={c.body}>
      <ul className="grid gap-10 md:grid-cols-3 md:gap-8">
        {c.items.map((t) => (
          <li key={t.label} className="border-t-2 border-ink pt-5">
            <Icon name={t.icon} className="size-5 text-accent" />
            <h3 className="mt-4 text-lg font-medium text-ink">{t.label}</h3>
            <p className="mt-2 text-base text-ink-muted">{t.description}</p>
            {t.tags.length > 0 && <p className="mt-4 text-sm text-ink-muted">{t.tags.join(", ")}</p>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Features({ c }: { c: HomeContent["features"] }) {
  if (!c.items.length) return null;
  return (
    <Section id="features" eyebrow={c.eyebrow} title={fullTitle(c)} body={c.body}>
      <ul className="grid gap-x-12 sm:grid-cols-2">
        {c.items.map((f) => (
          <li key={f.title} className="flex gap-4 border-t border-line py-6">
            <Icon name={f.icon} className="mt-1 size-5 shrink-0 text-ink-muted" />
            <div>
              <h3 className="text-md font-medium text-ink">{f.title}</h3>
              <p className="mt-1 text-base text-ink-muted">{f.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Comparison({ c }: { c: HomeContent["comparison"] }) {
  if (!c.rows.length) return null;
  return (
    <Section id="comparison" eyebrow={c.eyebrow} title={fullTitle(c)}>
      <div className="overflow-x-auto rounded-panel border border-line bg-surface">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-3 text-sm font-medium text-ink-muted">
                <span className="sr-only">Topic</span>
              </th>
              <th scope="col" className="px-5 py-3 text-sm font-medium text-ink-muted">
                {c.oldLabel}
              </th>
              <th scope="col" className="px-5 py-3 text-sm font-medium text-accent">
                {c.newLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-0">
                <th scope="row" className="px-5 py-4 text-base font-medium text-ink">
                  {r.label}
                </th>
                <td className="px-5 py-4 text-base text-ink-muted">{r.old}</td>
                <td className="px-5 py-4 text-base text-ink">{r.now}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function Testimonials({ c }: { c: HomeContent["testimonials"] }) {
  if (!c.quotes.length) return null;
  return (
    <Section id="testimonials" eyebrow={c.eyebrow} title={fullTitle(c)}>
      <ul className="grid gap-10 md:grid-cols-2">
        {c.quotes.map((q) => (
          <li key={q.name}>
            <blockquote>
              <p className="font-serif text-2xl leading-snug text-ink">&ldquo;{q.text}&rdquo;</p>
              <footer className="mt-4 text-base text-ink-muted">
                <span className="font-medium text-ink">{q.name}</span>, {q.role}
              </footer>
            </blockquote>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function BlogTeaser({ c, posts }: { c: HomeContent["blog"]; posts: PublicPostSummary[] }) {
  if (!posts.length) return null;
  return (
    <Section id="blog" eyebrow={c.eyebrow} title={fullTitle(c)} body={c.body}>
      <ul className="grid gap-8 md:grid-cols-3">
        {posts.map((p) => (
          <li key={p.slug} className="border-t border-line pt-5">
            <Link href={`/blog/${p.slug}`} className="group block">
              <p className="text-sm text-ink-muted">{p.published_at ? formatDate(p.published_at) : ""}</p>
              <h3 className="mt-2 text-lg font-medium text-ink group-hover:text-accent">{p.title}</h3>
              {p.excerpt && <p className="mt-2 line-clamp-3 text-base text-ink-muted">{p.excerpt}</p>}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/blog" className="mt-10 inline-flex text-base font-medium text-accent hover:underline">
        {c.ctaLabel || "All posts"}
      </Link>
    </Section>
  );
}

export function FinalCta({ c }: { c: HomeContent["finalCta"] }) {
  return (
    <section aria-labelledby="cta-title" className="border-t border-line bg-ink text-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-20 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          {c.eyebrow && <p className="text-base opacity-70">{c.eyebrow}</p>}
          <h2 id="cta-title" className="mt-2 font-serif text-3xl leading-tight sm:text-[3.25rem] sm:leading-[1.05]">
            {c.title}
          </h2>
          {c.body && <p className="mt-4 max-w-[58ch] text-md opacity-80">{c.body}</p>}
          {c.helperText && <p className="mt-3 text-sm opacity-70">{c.helperText}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <Href link={c.primaryCta} className="inline-flex h-11 items-center rounded-control bg-canvas px-5 text-md font-medium text-ink hover:opacity-90" />
          <Href link={c.secondaryCta} className="inline-flex h-11 items-center rounded-control border border-canvas/40 px-5 text-md font-medium text-canvas hover:bg-canvas/10" />
        </div>
      </div>
    </section>
  );
}
