import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { PostByline, PostCard } from "@/components/blog/PostCard";
import type { PublicBlogPostSummary } from "@/types/cms";
import { getPublicBlogList, BLOG_PAGE_SIZE } from "@/lib/cms/publicBlog";
import { getPublicCmsContent } from "@/lib/cms/publicContent";
import { getSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getPublicCmsContent();
  return {
    title: `Blog | ${cms.site.brand.name}`,
    description: `Articles and updates from ${cms.site.brand.name}.`,
    // The root layout defaults to noindex; public pages must explicitly
    // opt back in via the CMS "Allow indexing" toggle.
    robots: {
      index: cms.site.metadata.robotsIndex,
      follow: cms.site.metadata.robotsFollow,
    },
    alternates: {
      canonical: `${getSiteUrl()}/blog`,
      types: { "application/rss+xml": `${getSiteUrl()}/blog/feed.xml` },
    },
  };
}

function pageHref(target: number, targetTag?: string) {
  const query = new URLSearchParams();
  if (target > 1) query.set("page", String(target));
  if (targetTag) query.set("tag", targetTag);
  const suffix = query.toString();
  return suffix ? `/blog?${suffix}` : "/blog";
}

function tagChipClass(active: boolean) {
  return active
    ? "rounded-full border border-indigo-600 bg-indigo-600 text-white px-4 py-1.5 text-xs font-semibold transition-all shadow-xs"
    : "rounded-full border border-slate-300 bg-white text-slate-700 px-4 py-1.5 text-xs font-medium hover:border-slate-400 hover:text-indigo-600 hover:bg-slate-50 active:scale-95 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-indigo-400 dark:hover:bg-slate-800";
}

function BlogTagChips({ tag, tagChips }: { tag?: string; tagChips: string[] }) {
  if (tagChips.length === 0 && !tag) return null;
  const activeTagIsUnlisted = !!tag && !tagChips.some((chip) => chip.toLowerCase() === tag.toLowerCase());

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Link href="/blog" className={tagChipClass(!tag)}>
        All Posts
      </Link>
      {activeTagIsUnlisted && (
        <span className={tagChipClass(true)}>{tag}</span>
      )}
      {tagChips.map((chip) => (
        <Link key={chip} href={pageHref(1, chip)} className={tagChipClass(tag?.toLowerCase() === chip.toLowerCase())}>
          {chip}
        </Link>
      ))}
    </div>
  );
}

function FeaturedPost({ post }: { post: PublicBlogPostSummary }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group mb-12 grid gap-8 md:grid-cols-2 md:items-center">
      <div className="relative h-64 overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 md:h-80 shadow-sm ring-1 ring-slate-900/5 transition-all duration-300 group-hover:shadow-md group-hover:border-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:group-hover:border-slate-700">
        {post.cover_image_url ? (
          <Image
            src={post.cover_image_url}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-100 text-6xl font-bold text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            {post.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-50/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse dark:bg-indigo-400" />
          Latest Release
        </div>
        <h2 className="font-display text-3xl font-bold leading-tight text-slate-900 group-hover:text-indigo-600 transition-colors sm:text-4xl dark:text-white dark:group-hover:text-indigo-400">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="mt-4 line-clamp-3 text-sm sm:text-base leading-relaxed text-slate-600 font-normal dark:text-slate-300">{post.excerpt}</p>
        )}
        <div className="mt-6">
          <PostByline post={post} />
        </div>
      </div>
    </Link>
  );
}

function BlogPagination({ page, totalPages, tag }: { page: number; totalPages: number; tag?: string }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-14 flex items-center justify-center gap-4 text-xs font-semibold">
      {page > 1 ? (
        <Link
          href={pageHref(page - 1, tag)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-700 shadow-xs hover:border-slate-400 hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
        >
          ← Newer Posts
        </Link>
      ) : (
        <span />
      )}
      <span className="text-slate-500 uppercase tracking-wider dark:text-slate-400">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <Link
          href={pageHref(page + 1, tag)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-700 shadow-xs hover:border-slate-400 hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
        >
          Older Posts →
        </Link>
      )}
    </nav>
  );
}

export default async function BlogListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(Number.parseInt(params.page ?? "1", 10) || 1, 1);
  const tag = params.tag?.trim() || undefined;

  const [cms, blog] = await Promise.all([getPublicCmsContent(), getPublicBlogList(page, tag)]);
  const totalPages = Math.max(Math.ceil(blog.total / BLOG_PAGE_SIZE), 1);

  // Medium-style: on the front page the newest post becomes a large
  // featured story and the rest flow into the grid.
  const showFeatured = page === 1 && !tag && blog.items.length > 0;
  const featured = showFeatured ? blog.items[0] : null;
  const gridPosts = showFeatured ? blog.items.slice(1) : blog.items;

  const tagChips = Array.from(new Set(blog.items.flatMap((post) => post.tags))).slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-indigo-600 selection:text-white dark:bg-slate-950 dark:text-slate-100">
      <LandingNav content={cms.site} />

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">
        <header className="mb-10 border-b border-slate-300 pb-8 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Editorial Perspectives & Intelligence
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            {cms.site.brand.name} Dispatch
          </h1>
          <p className="mt-3 max-w-2xl text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Architecture, machine intelligence evaluation, and engineering recruitment protocols.
          </p>
          <BlogTagChips tag={tag} tagChips={tagChips} />
        </header>

        {blog.items.length === 0 ? (
          <div className="rounded-2xl border border-slate-300 bg-white p-16 text-center text-xs font-medium uppercase tracking-wider text-slate-500 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            {tag ? `No posts tagged “${tag}” yet.` : "No posts published yet. Stand by for dispatches."}
          </div>
        ) : (
          <>
            {featured && <FeaturedPost post={featured} />}

            {gridPosts.length > 0 && (
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {gridPosts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            )}
          </>
        )}

        <BlogPagination page={page} totalPages={totalPages} tag={tag} />
      </main>

      <LandingFooter content={cms.site} />
    </div>
  );
}
