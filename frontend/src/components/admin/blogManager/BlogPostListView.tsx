import Image from "next/image";
import { clsx } from "clsx";
import { FileText, PenSquare, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { BlogPostSummary } from "@/types/cms";
import { formatDate, isScheduled, type StatusFilter } from "@/hooks/useBlogManagerFlow";
import { fieldClasses } from "./fieldClasses";

interface Props {
  posts: BlogPostSummary[];
  total: number;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  loadingMore: boolean;
  onNewPost: () => void;
  onOpenPost: (id: string) => void;
  onLoadMore: () => void;
  deleteTarget: BlogPostSummary | null;
  onRequestDelete: (post: BlogPostSummary) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  deleteBusy: boolean;
}

export function BlogPostListView({
  posts,
  total,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  loading,
  loadingMore,
  onNewPost,
  onOpenPost,
  onLoadMore,
  deleteTarget,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  deleteBusy,
}: Props) {
  return (
    <>
      <section className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Blog posts</h2>
            <span className="text-sm text-slate-400 dark:text-slate-500">{total} total</span>
          </div>
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={onNewPost}>
            New post
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="blog-list-search" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="blog-list-search"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search titles…"
                className={fieldClasses("w-64 pl-9")}
              />
            </div>
          </div>
          <div className="flex gap-1 rounded-lg bg-white p-1 dark:bg-slate-900">
            {(["all", "draft", "published"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => onStatusFilterChange(filter)}
                className={clsx(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  statusFilter === filter
                    ? "bg-slate-200 text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
          {loading && <p className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading posts…</p>}
          {!loading && posts.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No posts yet. Click “New post” to write your first article.
            </div>
          )}
          {!loading &&
            posts.map((post) => (
              <div
                key={post.id}
                className="flex w-full items-center gap-2 rounded-xl bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <button
                  type="button"
                  onClick={() => onOpenPost(post.id)}
                  className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left"
                >
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                    {post.cover_image_url ? (
                      <Image
                        src={post.cover_image_url}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <PenSquare className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{post.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      /blog/{post.slug}
                      {post.author_name ? ` · ${post.author_name}` : ""}
                      {` · updated ${formatDate(post.updated_at)}`}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      post.status === "published"
                        ? isScheduled(post.status, post.published_at)
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    )}
                  >
                    {post.status === "published"
                      ? isScheduled(post.status, post.published_at)
                        ? "Scheduled"
                        : "Published"
                      : "Draft"}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${post.title}`}
                  onClick={() => onRequestDelete(post)}
                  className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-danger-light hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>

        {!loading && posts.length < total && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            loading={loadingMore}
            onClick={onLoadMore}
          >
            Show more ({total - posts.length} more)
          </Button>
        )}
      </section>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this blog post?"
          description={
            <>
              <span className="font-medium text-slate-900">&ldquo;{deleteTarget.title}&rdquo;</span>{" "}
              will be removed from the blog and CMP post list.
            </>
          }
          confirmLabel="Delete post"
          confirmingLabel="Deleting…"
          isConfirming={deleteBusy}
          variant="danger"
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
        />
      )}
    </>
  );
}
