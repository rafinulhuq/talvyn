import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { publicPosts, siteContent } from "@/server/cms";

export const dynamic = "force-dynamic";
const PER_PAGE = 12;

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await siteContent();
  return { title: "Blog", description: `Writing from ${site.brand.name} on hiring and assessment.`, alternates: { types: { "application/rss+xml": "/blog/feed.xml" } } };
}

export default async function BlogIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tag = typeof sp.tag === "string" ? sp.tag.slice(0, 40) : undefined;
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));
  const { items, total } = await publicPosts({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE, tag });
  const pages = Math.ceil(total / PER_PAGE);
  const tags = [...new Set(items.flatMap((p) => p.tags))].slice(0, 12);
  const href = (p: number) => `/blog?${new URLSearchParams({ ...(tag ? { tag } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8">
      <header className="max-w-2xl">
        <h1 className="font-serif text-[3.25rem] leading-none tracking-[-0.015em] text-ink">Blog</h1>
        <p className="mt-4 text-md text-ink-muted">{tag ? `Posts tagged ${tag}.` : "Notes on hiring, assessment and running a fair process."}</p>
      </header>
      {(tags.length > 0 || tag) && (
        <nav aria-label="Topics" className="mt-8 flex flex-wrap gap-2">
          <Link href="/blog" className={cn("rounded-control border px-2.5 py-1 text-sm", !tag ? "border-ink text-ink" : "border-line text-ink-muted hover:text-ink")}>
            All
          </Link>
          {tags.map((t) => (
            <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`} className={cn("rounded-control border px-2.5 py-1 text-sm", t === tag ? "border-ink text-ink" : "border-line text-ink-muted hover:text-ink")}>
              {t}
            </Link>
          ))}
        </nav>
      )}
      {items.length === 0 ? (
        <p className="mt-16 text-md text-ink-muted">{tag ? "No posts with this tag yet." : "No posts yet. Check back soon."}</p>
      ) : (
        <ul className="mt-12 grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.slug} className="border-t border-line pt-5">
              <Link href={`/blog/${p.slug}`} className="group block">
                {p.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- CMS media
                  <img src={p.cover_image_url} alt="" loading="lazy" className="mb-5 aspect-[16/9] w-full rounded-panel border border-line object-cover" />
                )}
                <p className="text-sm text-ink-muted">
                  {p.published_at ? formatDate(p.published_at) : ""}
                  {p.reading_minutes ? `, ${p.reading_minutes} min read` : ""}
                </p>
                <h2 className="mt-2 text-lg font-medium text-ink group-hover:text-accent">{p.title}</h2>
                {p.excerpt && <p className="mt-2 line-clamp-3 text-base text-ink-muted">{p.excerpt}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-16 flex justify-between border-t border-line pt-6 text-base">
          {page > 1 ? <Link href={href(page - 1)} className="text-accent hover:underline">Newer posts</Link> : <span />}
          {page < pages ? <Link href={href(page + 1)} className="text-accent hover:underline">Older posts</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
