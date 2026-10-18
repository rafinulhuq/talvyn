/**
 * TestsGridWithBulkActions
 *
 * Wraps the test-card grid on the Assessment Tests list page with
 * select-mode: a checkbox per card, "select all", "Delete selected (N)",
 * and "Delete all". Mirrors the same safety pattern as TestEditorPanel's
 * per-question bulk delete.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TestCard } from "@/components/admin/TestCard";
import { getStringArrayErrorDetail } from "@/lib/api/client";
import { testsApi } from "@/lib/api/tests";
import type { TestSummary } from "@/types/test";

interface TestsGridWithBulkActionsProps {
  tests: TestSummary[];
  jdId: string;
}

export function TestsGridWithBulkActions({ tests, jdId }: TestsGridWithBulkActionsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const [forceConfirm, setForceConfirm] = useState<{
    count: number;
    retry: () => void;
  } | null>(null);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === tests.length ? new Set() : new Set(tests.map((t) => t.id))
    );
  }

  async function runDelete(ids: string[], force = false) {
    setDeleting(true);
    setError(null);
    try {
      const result = await testsApi.bulkDeleteTests(ids, force);

      if (!result.success) {
        const inUseIds = getStringArrayErrorDetail(result, "in_use_question_ids");
        if (inUseIds?.length) {
          setForceConfirm({ count: inUseIds.length, retry: () => runDelete(ids, true) });
          return;
        }
        setError(result.error.message ?? "Failed to delete selected tests.");
        return;
      }
      setSelectedIds(new Set());
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const allSelected = tests.length > 0 && selectedIds.size === tests.length;

  return (
    <div>
      {tests.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              aria-label="Select all tests"
            />
            Select all
          </label>

          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setPendingIds(Array.from(selectedIds))}
              disabled={deleting}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Delete selected ({selectedIds.size})
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setPendingIds(tests.map((t) => t.id))}
            disabled={deleting}
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Delete all
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300">
          [Error] {error}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tests.map((test) => (
          <div key={test.id} className="relative">
            <label
              className="absolute -left-2 -top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white shadow-xs dark:border-slate-700 dark:bg-slate-800 hover:border-indigo-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(test.id)}
                onChange={() => toggleSelect(test.id)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                aria-label={`Select ${test.title}`}
              />
            </label>
            <TestCard test={test} jdId={jdId} />
          </div>
        ))}
      </div>

      {pendingIds && (
        <ConfirmDialog
          title={
            pendingIds.length === tests.length
              ? "Delete all tests?"
              : `Delete ${pendingIds.length} selected test${pendingIds.length === 1 ? "" : "s"}?`
          }
          description="The test(s) and all of their questions will be permanently deleted. Any candidate results tied to them will be lost. This cannot be undone."
          confirmLabel="Delete"
          confirmingLabel="Deleting…"
          isConfirming={deleting}
          variant="danger"
          onConfirm={() => {
            const ids = pendingIds;
            setPendingIds(null);
            void runDelete(ids);
          }}
          onCancel={() => setPendingIds(null)}
        />
      )}

      {forceConfirm && (
        <ConfirmDialog
          title="Question(s) already used by a candidate"
          description={
            <>
              {forceConfirm.count === 1
                ? "One of these tests has a question that has"
                : `${forceConfirm.count} question(s) across these tests have`}{" "}
              already been assigned to a candidate&rsquo;s exam attempt. Deleting
              anyway will also remove that candidate&rsquo;s locked record from
              their audit trail. This cannot be undone.
            </>
          }
          confirmLabel="Delete anyway"
          confirmingLabel="Deleting…"
          isConfirming={deleting}
          variant="danger"
          onConfirm={forceConfirm.retry}
          onCancel={() => setForceConfirm(null)}
        />
      )}
    </div>
  );
}
