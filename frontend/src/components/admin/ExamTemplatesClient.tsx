"use client";

import { useEffect, useState } from "react";
import { Archive, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ExamTemplateForm } from "@/components/admin/ExamTemplateForm";
import { examTemplatesApi } from "@/lib/api/examTemplates";
import { SECTION_LABELS, SECTION_ORDER, type ExamTemplate } from "@/types/exam";

const STATUS_BADGE = {
  DRAFT: { variant: "yellow" as const, label: "Draft" },
  ACTIVE: { variant: "green" as const, label: "Active" },
  ARCHIVED: { variant: "slate" as const, label: "Archived" },
};

function configSummary(template: ExamTemplate): string {
  const { mcq_target, cq_target, section_weights } = template.config_json;
  const parts: string[] = [];
  if (mcq_target != null || cq_target != null) {
    parts.push(`${mcq_target ?? "—"} MCQ / ${cq_target ?? "—"} CQ`);
  }
  if (section_weights) {
    parts.push(
      SECTION_ORDER.filter((s) => section_weights[s] != null)
        .map((s) => `${SECTION_LABELS[s]} ${Math.round((section_weights[s] ?? 0) * 100)}%`)
        .join(" · ")
    );
  }
  return parts.join(" · ") || "No config set";
}

export function ExamTemplatesClient() {
  const [templates, setTemplates] = useState<ExamTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExamTemplate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExamTemplate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function applyListResult(result: Awaited<ReturnType<typeof examTemplatesApi.list>>) {
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setTemplates(result.data.items);
  }

  async function refresh() {
    applyListResult(await examTemplatesApi.list(true));
  }

  useEffect(() => {
    examTemplatesApi.list(true).then(applyListResult);
  }, []);

  async function handleArchive(template: ExamTemplate) {
    setBusyId(template.id);
    const result = await examTemplatesApi.archive(template.id);
    setBusyId(null);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    await refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    const result = await examTemplatesApi.remove(pendingDelete.id);
    setBusyId(null);
    setPendingDelete(null);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    await refresh();
  }

  if (showForm || editing) {
    return (
      <ExamTemplateForm
        template={editing ?? undefined}
        onSaved={() => {
          setShowForm(false);
          setEditing(null);
          refresh();
        }}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowForm(true)}
        >
          New template
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {templates === null ? null : templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title="No templates yet"
          description="Save a reusable MCQ/CQ target and section-weight preset here, then apply it whenever you generate a question bank for a job — no need to reconfigure from scratch each time."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{template.name}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      template.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : template.status === "DRAFT"
                        ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {STATUS_BADGE[template.status].label}
                  </span>
                </div>
                {template.description && (
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{template.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{configSummary(template)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(template)}
                  disabled={busyId === template.id}
                  aria-label="Edit template"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs hover:border-slate-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-indigo-400 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {template.status !== "ARCHIVED" && (
                  <button
                    type="button"
                    onClick={() => handleArchive(template)}
                    disabled={busyId === template.id}
                    aria-label="Archive template"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs hover:border-slate-300 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100 transition-colors"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPendingDelete(template)}
                  disabled={busyId === template.id}
                  aria-label="Delete template"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-xs hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-900/50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this template?"
          description={`"${pendingDelete.name}" will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete"
          confirmingLabel="Deleting…"
          isConfirming={busyId === pendingDelete.id}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
