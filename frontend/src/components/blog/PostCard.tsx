import Image from "next/image";
import Link from "next/link";

import { authorInitials, formatPostDate } from "@/lib/blogFormat";
import type { PublicBlogPostSummary } from "@/types/cms";

export function PostByline({
  post,
  compact = false,
}: {
  post: PublicBlogPostSummary;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-slate-500 font-sans dark:text-slate-400">
      <span
        className={
          compact
            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
            : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
        }
      >
        {authorInitials(post.author_name)}
      </span>
      <span className={compact ? "truncate text-xs font-medium text-slate-700 dark:text-slate-300" : "truncate text-sm font-medium text-slate-700 dark:text-slate-300"}>
        {post.author_name ?? "Talvyn"}
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
        {formatPostDate(post.published_at)}
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
        {post.reading_minutes} min read
      </span>
    </div>
  );
}

export function PostCard({ post }: { post: PublicBlogPostSummary }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/5 hover:shadow-md hover:border-slate-400 transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <Link href={`/blog/${post.slug}`} className="flex h-full flex-col">
        <div className="relative h-44 shrink-0 overflow-hidden bg-slate-100 border-b border-slate-300 dark:bg-slate-800 dark:border-slate-800">
          {post.cover_image_url ? (
            <Image
              src={post.cover_image_url}
              alt=""
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-slate-100 text-3xl font-bold text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              {post.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-6">
          {post.tags.length > 0 && (
            <p className="mb-2 inline-flex items-center self-start rounded-full border border-indigo-300 bg-indigo-50/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
              {post.tags[0]}
            </p>
          )}
          <h3 className="font-display text-base font-bold leading-snug text-slate-900 group-hover:text-indigo-600 transition-colors dark:text-white dark:group-hover:text-indigo-400">
            {post.title}
          </h3>
          {post.excerpt && (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600 font-normal dark:text-slate-300">{post.excerpt}</p>
          )}
          <div className="mt-auto pt-4">
            <PostByline post={post} compact />
          </div>
        </div>
      </Link>
    </article>
  );
}
