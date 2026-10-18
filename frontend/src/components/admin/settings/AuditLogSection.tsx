"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { AuditLogEntry } from "@/types/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  INVITATION_REVOKED: "Invitation revoked",
  INVITATION_RESENT: "Invitation resent",
  EVALUATION_OVERRIDDEN: "Evaluation override",
  QUESTION_SCORE_OVERRIDDEN: "Question score override",
  DATA_RESET: "Data reset",
  DATA_RESTORED: "Data restored",
};

export function AuditLogSection() {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await adminApi.listAuditLog(page, 10);
        if (cancelled) return;

        if (!response.success) {
          setError(response.error.message);
          return;
        }
        setEntries(response.data.items);
        setTotalPages(response.data.total_pages);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Audit Log</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Recent sensitive admin actions: invitation revoke/resend,
            evaluation overrides, and data reset/restore.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="py-4 text-xs text-slate-500 dark:text-slate-400">Loading audit history…</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-xs text-slate-500 dark:text-slate-400">No admin actions logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-800/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
                    {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
                {entry.summary && (
                  <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">{entry.summary}</p>
                )}
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Actor: <span className="font-medium text-slate-700 dark:text-slate-300">{entry.actor_name ?? entry.actor_email ?? "System"}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<ChevronLeft className="h-4 w-4" />}
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" />}
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
