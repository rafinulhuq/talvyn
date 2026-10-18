"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Trash2,
  RotateCcw,
  Loader2,
  FileText,
  ClipboardList,
  Users,
  Newspaper,
} from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { trashApi, type TrashItem, type TrashEntityType } from "@/lib/api/trash";

const ENTITY_META: Record<
  TrashEntityType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  jd: { label: "Job Descriptions", icon: FileText },
  test: { label: "Tests", icon: ClipboardList },
  candidate: { label: "Candidates", icon: Users },
  blog: { label: "Blog Posts", icon: Newspaper },
};

const ENTITY_ORDER: TrashEntityType[] = ["jd", "test", "candidate", "blog"];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    const res = await trashApi.list();
    setLoading(false);
    if (res.success) {
      setItems(res.data.items);
      setError(null);
    } else {
      setError(res.error.message || "Could not load the trash.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(item: TrashItem) {
    const key = `${item.entity_type}:${item.id}`;
    setBusyKey(key);
    const res = await trashApi.restore(item.entity_type, item.id);
    setBusyKey(null);
    if (res.success) {
      setItems((prev) => prev.filter((i) => !(i.entity_type === item.entity_type && i.id === item.id)));
    } else {
      setError(res.error.message || "Restore failed.");
    }
  }

  async function handlePurge() {
    if (!purgeTarget) return;
    setPurging(true);
    const res = await trashApi.purge(purgeTarget.entity_type, purgeTarget.id);
    setPurging(false);
    if (res.success) {
      setItems((prev) =>
        prev.filter((i) => !(i.entity_type === purgeTarget.entity_type && i.id === purgeTarget.id))
      );
      setPurgeTarget(null);
    } else {
      setError(res.error.message || "Delete failed.");
      setPurgeTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <Breadcrumbs items={[{ label: "Trash" }]} className="mb-6" />

      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-500/20 dark:bg-rose-950/40 dark:text-rose-400">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Recover Deleted Items
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Deleted entities can be safely restored, or permanently purged from the system.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-6 w-6" />}
          title="Trash is empty"
          description="Deleted job descriptions, tests, candidates, and blog posts will appear here."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {ENTITY_ORDER.map((type) => {
            const group = items.filter((i) => i.entity_type === type);
            if (group.length === 0) return null;
            const { label, icon: Icon } = ENTITY_META[type];
            return (
              <section key={type}>
                <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {label}
                    </h2>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {group.length}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {group.map((item) => {
                    const key = `${item.entity_type}:${item.id}`;
                    const busy = busyKey === key;
                    return (
                      <div
                        key={key}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.label}
                          </p>
                          {item.sublabel && (
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {item.sublabel}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 sm:hidden">
                            Deleted {formatWhen(item.deleted_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:block">
                            Deleted {formatWhen(item.deleted_at)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRestore(item)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-indigo-400"
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => setPurgeTarget(item)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {purgeTarget && (
        <ConfirmDialog
          title="Delete permanently?"
          description={
            <>
              <span className="font-medium">{purgeTarget.label}</span> will be permanently
              deleted. This cannot be undone.
            </>
          }
          confirmLabel="Delete permanently"
          confirmingLabel="Deleting…"
          isConfirming={purging}
          variant="danger"
          icon={<Trash2 className="h-5 w-5" />}
          onConfirm={handlePurge}
          onCancel={() => setPurgeTarget(null)}
        />
      )}
    </div>
  );
}
