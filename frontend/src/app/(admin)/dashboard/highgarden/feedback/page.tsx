import Link from "next/link";
import { Archive, Check, MessageSquare, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";
import { deleteHighgardenFeedback, updateHighgardenFeedbackStatus } from "../actions";

type SearchParams = {
  status?: string;
};

type FeedbackStatus = "UNREAD" | "READ" | "ARCHIVED";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export default async function HighgardenFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireHighgardenAccess();
  const params = await searchParams;
  const status = STATUS_OPTIONS.some((option) => option.value === params.status) ? params.status || "all" : "all";

  const [feedback, counts] = await Promise.all([
    prisma.highgardenFeedback.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { session: { select: { id: true } } },
    }),
    prisma.highgardenFeedback.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);
  const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/highgarden" className="text-sm font-medium text-brand-600 dark:text-brand-400">
            Back to Highgarden
          </Link>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <MessageSquare className="h-4 w-4" />
            Highgarden
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">Feedback</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Qualitative feedback submitted from the first-party widget.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const value = option.value === "all" ? feedback.length : countByStatus.get(option.value as FeedbackStatus) ?? 0;
          const selected = status === option.value;
          return (
            <Link
              key={option.value}
              href={option.value === "all" ? "/dashboard/highgarden/feedback" : `/dashboard/highgarden/feedback?status=${option.value}`}
              className={
                selected
                  ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
                  : "rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }
            >
              {option.label} ({value})
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
        {feedback.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No feedback found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {feedback.map((item) => (
              <article key={item.id} className="rounded-xl bg-white p-4 dark:bg-slate-900">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge-slate">{item.rating}/5</span>
                      <span className="badge-slate">{item.category}</span>
                      <span className="badge-slate">{item.status}</span>
                    </div>
                    <p className="mt-2 break-all text-sm font-medium text-slate-800 dark:text-slate-100">{item.path}</p>
                    <p className="text-xs text-slate-400">
                      {item.createdAt.toLocaleString()}
                      {item.session?.id ? ` · session ${item.session.id}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.status !== "READ" && (
                      <ActionButton action={updateHighgardenFeedbackStatus.bind(null, item.id, "READ")} label="Mark read" icon="check" />
                    )}
                    {item.status !== "ARCHIVED" && (
                      <ActionButton action={updateHighgardenFeedbackStatus.bind(null, item.id, "ARCHIVED")} label="Archive" icon="archive" />
                    )}
                    <ActionButton action={deleteHighgardenFeedback.bind(null, item.id)} label="Delete" icon="trash" danger />
                  </div>
                </div>
                {item.comment ? (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">{item.comment}</p>
                ) : (
                  <p className="text-sm text-slate-400">No comment.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  action,
  label,
  icon,
  danger = false,
}: {
  action: () => Promise<void>;
  label: string;
  icon: "check" | "archive" | "trash";
  danger?: boolean;
}) {
  const Icon = icon === "check" ? Check : icon === "archive" ? Archive : Trash2;
  return (
    <form action={action}>
      <button
        type="submit"
        className={
          danger
            ? "inline-flex items-center gap-1 rounded-full bg-danger-light px-2.5 py-1.5 text-xs font-medium text-danger-dark transition-colors duration-150 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60"
            : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        }
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    </form>
  );
}
