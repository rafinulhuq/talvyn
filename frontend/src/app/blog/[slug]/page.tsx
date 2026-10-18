import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownContent } from "@/components/MarkdownContent";
import { ClapButton } from "@/components/blog/ClapButton";
import { PostCard } from "@/components/blog/PostCard";
import { ReadingProgressBar } from "@/components/blog/ReadingProgressBar";
import { ShareButtons } from "@/components/blog/ShareButtons";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { authorInitials, formatPostDate, stripLeadingTitleHeading } from "@/lib/blogFormat";
import { getPublicBlogList, getPublicBlogPost } from "@/lib/cms/publicBlog";
import { getPublicCmsContent } from "@/lib/cms/publicContent";
import { getSiteUrl } from "@/lib/siteUrl";
import type { PublicBlogPostSummary } from "@/types/cms";

export const dynamic = "force-dynamic";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [cms, post] = await Promise.all([getPublicCmsContent(), getPublicBlogPost(slug)]);
  if (!post) {
    return { title: `Blog | ${cms.site.brand.name}` };
  }
  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt || undefined;
  return {
    title: `${title} | ${cms.site.brand.name}`,
    description,
    // The root layout defaults to noindex; public pages must explicitly
    // opt back in via the CMS "Allow indexing" toggle.
    robots: {
      index: cms.site.metadata.robotsIndex,
      follow: cms.site.metadata.robotsFollow,
    },
    alternates: {
      canonical: `${getSiteUrl()}/blog/${encodeURIComponent(slug)}`,
    },
    openGraph: {
      title,
      description,
      type: "article",
      ...(post.cover_image_url ? { images: [{ url: post.cover_image_url }] } : {}),
    },
  };
}

function pickRelated(
  all: PublicBlogPostSummary[],
  current: { slug: string; tags: string[] }
): PublicBlogPostSummary[] {
  const others = all.filter((post) => post.slug !== current.slug);
  const currentTags = new Set(current.tags.map((tag) => tag.toLowerCase()));
  const shared = others.filter((post) =>
    post.tags.some((tag) => currentTags.has(tag.toLowerCase()))
  );
  const sharedSet = new Set(shared);
  const rest = others.filter((post) => !sharedSet.has(post));
  return [...shared, ...rest].slice(0, 3);
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const [cms, post, recent] = await Promise.all([
    getPublicCmsContent(),
    getPublicBlogPost(slug),
    getPublicBlogList(1),
  ]);
  if (!post) notFound();

  const related = pickRelated(recent.items, post);
  const body = stripLeadingTitleHeading(post.content_md, post.title);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-indigo-600 selection:text-white dark:bg-slate-950 dark:text-slate-100">
      <ReadingProgressBar />
      <LandingNav content={cms.site} />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-14 sm:px-6">
        <nav className="mb-8 text-sm">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-indigo-600 transition-colors dark:text-slate-400 dark:hover:text-indigo-400">
            ← All Posts
          </Link>
        </nav>

        <header>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-50/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse dark:bg-indigo-400" />
            Dispatch Entry
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-4 text-lg sm:text-xl leading-relaxed text-slate-600 font-normal dark:text-slate-300">{post.excerpt}</p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-slate-300 py-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 border border-indigo-200 text-sm font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-400">
                {authorInitials(post.author_name)}
              </span>
              <div>
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {post.author_name ?? "Talvyn"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatPostDate(post.published_at)}
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                  {post.reading_minutes} min read
                </p>
              </div>
            </div>
            <ShareButtons title={post.title} />
          </div>
        </header>

        {post.cover_image_url && (
          <div className="relative mt-10 h-[28rem] w-full overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-800">
            <Image
              src={post.cover_image_url}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <article className="mt-10">
          <MarkdownContent content={body} variant="article" />
        </article>

        <footer className="mt-12 space-y-8">
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/blog?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-slate-300 bg-white px-3.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:border-slate-400 hover:text-indigo-600 hover:bg-slate-50 active:scale-95 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-indigo-400 dark:hover:bg-slate-800"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-300 py-4 dark:border-slate-800">
            <ClapButton slug={post.slug} initialClaps={post.claps} />
            <ShareButtons title={post.title} />
          </div>
        </footer>
      </main>

      {related.length > 0 && (
        <section className="border-t border-slate-300 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Related Dispatches
            </div>
            <h2 className="mb-8 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Read Next</h2>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <PostCard key={item.slug} post={item} />
              ))}
            </div>
          </div>
        </section>
      )}

      <LandingFooter content={cms.site} />
    </div>
  );
}
