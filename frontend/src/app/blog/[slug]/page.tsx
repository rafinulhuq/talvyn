import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClapButton } from "@/components/marketing/clap";
import { Prose } from "@/components/marketing/markdown";
import { formatDate } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { publicPost } from "@/server/cms";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
const getPost = cache((slug: string) => publicPost(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug).catch(() => null);
  if (!post) return { title: "Post not found" };
  const url = `${getSiteUrl()}/blog/${post.slug}`;
  const description = post.seo_description ?? post.excerpt ?? undefined;
  return {
    title: post.seo_title ?? post.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: post.seo_title ?? post.title, description, publishedTime: post.published_at ?? undefined, images: post.cover_image_url ? [post.cover_image_url] : undefined },
  };
}

/** Editors often repeat the title as the first heading; don't show it twice. */
const withoutTitle = (md: string, title: string) => md.replace(new RegExp(`^\\s*#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`, "i"), "");

export default async function PostPage({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const url = `${getSiteUrl()}/blog/${post.slug}`;
  const share = [
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: "X", href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}` },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(url)}` },
  ];
  return (
    <article className="mx-auto max-w-6xl px-5 pb-24 pt-14 sm:px-8">
      <Link href="/blog" className="text-base text-ink-muted hover:text-ink">
        Blog
      </Link>
      <header className="mt-6 max-w-3xl">
        <h1 className="font-serif text-[2.5rem] leading-[1.05] tracking-[-0.015em] text-ink sm:text-[3.5rem]">{post.title}</h1>
        {post.excerpt && <p className="mt-5 max-w-[60ch] text-lg text-ink-muted">{post.excerpt}</p>}
        <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-base text-ink-muted">
          {post.author_name && <span className="text-ink">{post.author_name}</span>}
          {post.published_at && <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>}
          {post.reading_minutes > 0 && <span>{post.reading_minutes} min read</span>}
        </p>
      </header>
      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- CMS media
        <img src={post.cover_image_url} alt="" className="mt-10 aspect-[2/1] w-full rounded-panel border border-line object-cover" />
      )}
      <div className="mt-12">
        <Prose markdown={withoutTitle(post.content_md, post.title)} />
      </div>
      <footer className="mt-16 flex max-w-[68ch] flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <ClapButton slug={post.slug} initial={post.claps} />
        <p className="flex flex-wrap items-center gap-3 text-base text-ink-muted">
          Share:
          {share.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-accent">
              {s.label}
            </a>
          ))}
        </p>
        {post.tags.length > 0 && (
          <p className="w-full text-sm text-ink-muted">
            Tagged{" "}
            {post.tags.map((t, i) => (
              <span key={t}>
                {i > 0 && ", "}
                <Link href={`/blog?tag=${encodeURIComponent(t)}`} className="text-ink hover:text-accent">
                  {t}
                </Link>
              </span>
            ))}
          </p>
        )}
      </footer>
    </article>
  );
}
