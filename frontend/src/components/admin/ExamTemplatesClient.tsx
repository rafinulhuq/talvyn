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
              className="flex items-start justify-between gap-4 rounded-xl border border-white/8 bg-[#121317] p-5 shadow-xs transition-colors hover:border-white/20 text-white"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-white">{template.name}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      template.status === "ACTIVE"
                        ? "bg-[#4ADE80]/10 text-[#4ADE80] ring-1 ring-inset ring-[#4ADE80]/20"
                        : template.status === "DRAFT"
                        ? "bg-[#FACC15]/10 text-[#FACC15] ring-1 ring-inset ring-[#FACC15]/20"
                        : "bg-[#181A1F] text-white/80 border border-white/10"
                    }`}
                  >
                    {STATUS_BADGE[template.status].label}
                  </span>
                </div>
                {template.description && (
                  <p className="mt-1 truncate text-xs text-white/80">{template.description}</p>
                )}
                <p className="mt-1 text-xs text-white/70">{configSummary(template)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(template)}
                  disabled={busyId === template.id}
                  aria-label="Edit template"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#181A1F] text-white/80 hover:border-white/20 hover:text-white disabled:opacity-50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {template.status !== "ARCHIVED" && (
                  <button
                    type="button"
                    onClick={() => handleArchive(template)}
                    disabled={busyId === template.id}
                    aria-label="Archive template"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#181A1F] text-white/80 hover:border-white/20 hover:text-white disabled:opacity-50 transition-colors"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPendingDelete(template)}
                  disabled={busyId === template.id}
                  aria-label="Delete template"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#181A1F] text-white/80 hover:border-[#F87171]/40 hover:text-[#F87171] disabled:opacity-50 transition-colors"
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
