/**
 * TestEditorPanel
 *
 * Full test review panel with:
 * - Test metadata (title, duration editable inline)
 * - Approve / Revert to Draft button
 * - Regenerate test button (replaces all questions)
 * - QuestionEditor for every question (expand/edit/delete)
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DeleteTestDialog } from "@/components/admin/DeleteTestDialog";
import { TestHeaderCard } from "@/components/admin/TestHeaderCard";
import { QuestionListSection } from "@/components/admin/QuestionListSection";
import { getStringArrayErrorDetail } from "@/lib/api/client";
import { testsApi } from "@/lib/api/tests";
import { sortQuestions } from "@/lib/questionSort";
import type { Test, Question } from "@/types/test";
import { TEST_TYPE_COLORS } from "@/types/test";

interface TestEditorPanelProps {
  initialTest: Test;
}

const typeColorMap: Record<string, "blue" | "purple" | "green"> = {
  blue: "blue",
  purple: "purple",
  green: "green",
};

export function TestEditorPanel({ initialTest }: TestEditorPanelProps) {
  const router = useRouter();
  const [test, setTest] = useState<Test>(initialTest);
  const [questions, setQuestions] = useState<Question[]>(() => sortQuestions(initialTest.questions));

  const [approving, setApproving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Native window.confirm is unstyled, unthemed, and on iOS it renders as a
  // system sheet that looks nothing like the rest of the app — the same
  // ConfirmDialog every other destructive action already uses instead.
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Set when a delete (single/bulk/whole-test) comes back 409 QUESTIONS_IN_USE —
  // `retry` re-issues the same delete with force=true if the admin confirms.
  const [forceConfirm, setForceConfirm] = useState<{
    count: number;
    retry: () => void;
  } | null>(null);

  const typeColor = typeColorMap[TEST_TYPE_COLORS[test.test_type]] ?? "blue";
  const isApproved = test.status === "APPROVED";

  // The tests list and detail page can be reached through client-side route
  // transitions. Refetch once on mount so a previously prefetched detail view
  // cannot keep showing an old draft/approved state.
  useEffect(() => {
    let active = true;

    async function refreshLatestTest() {
      const result = await testsApi.get(initialTest.id);
      if (!active || !result.success) return;
      setTest(result.data);
      setQuestions(sortQuestions(result.data.questions));
    }

    void refreshLatestTest();

    return () => {
      active = false;
    };
  }, [initialTest.id]);

  // ── Approve / revert ──────────────────────────────────────────
  async function handleApprove() {
    setApproving(true);
    setActionError(null);
    const newStatus = isApproved ? "DRAFT" : "APPROVED";
    const result = await testsApi.setStatus(test.id, newStatus);
    setApproving(false);

    if (!result.success) {
      setActionError(result.error.message ?? "Failed to update status.");
      return;
    }
    setTest(result.data);
    setQuestions(sortQuestions(result.data.questions));
    router.refresh();
  }

  // ── Regenerate ────────────────────────────────────────────────
  async function handleRegenerate() {
    setShowRegenerateConfirm(false);
    setRegenerating(true);
    setActionError(null);
    try {
      const result = await testsApi.regenerate(test.id);

      if (!result.success) {
        setActionError(result.error.message ?? "Regeneration failed.");
        return;
      }
      setTest(result.data);
      setQuestions(sortQuestions(result.data.questions));
      router.refresh();
    } finally {
      setRegenerating(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(force = false) {
    setDeleting(true);
    setActionError(null);
    try {
      const result = await testsApi.delete(test.id, force);

      if (!result.success) {
        const inUseIds = getStringArrayErrorDetail(result, "in_use_question_ids");
        if (inUseIds?.length) {
          setShowDeleteDialog(false);
          setForceConfirm({ count: inUseIds.length, retry: () => handleDelete(true) });
          return;
        }
        setShowDeleteDialog(false);
        setActionError(result.error.message ?? "Failed to delete test.");
        return;
      }
      router.push(`/dashboard/jds/${test.jd_id}/tests`);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  // ── Question CRUD ─────────────────────────────────────────────
  function handleQuestionUpdate(updated: Question) {
    setQuestions((prev) => sortQuestions(prev.map((q) => (q.id === updated.id ? updated : q))));
  }

  async function handleQuestionDelete(questionId: string, force = false) {
    const result = await testsApi.deleteQuestion(questionId, force);
    if (!result.success) {
      const inUseIds = getStringArrayErrorDetail(result, "in_use_question_ids");
      if (inUseIds?.length) {
        setForceConfirm({
          count: inUseIds.length,
          retry: () => handleQuestionDelete(questionId, true),
        });
        return;
      }
      setActionError("Failed to delete question.");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    setSelectedIds((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }

  // ── Bulk select / delete ───────────────────────────────────────
  function toggleSelect(questionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === questions.length ? new Set() : new Set(questions.map((q) => q.id))
    );
  }

  async function handleBulkDelete(force = false) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBulkDeleting(true);
    setActionError(null);
    try {
      const result = await testsApi.bulkDeleteQuestions(test.id, ids, force);

      if (!result.success) {
        const inUseIds = getStringArrayErrorDetail(result, "in_use_question_ids");
        if (inUseIds?.length) {
          setForceConfirm({ count: inUseIds.length, retry: () => handleBulkDelete(true) });
          return;
        }
        setActionError("Failed to delete selected questions.");
        return;
      }
      setQuestions((prev) => prev.filter((q) => !selectedIds.has(q.id)));
      setSelectedIds(new Set());
    } finally {
      setBulkDeleting(false);
    }
  }

  const mcqCount = questions.filter((q) => q.question_type === "MCQ").length;
  const oeCount = questions.filter((q) => q.question_type === "OPEN_ENDED").length;
  const codeCount = questions.filter((q) => q.question_type === "CODE").length;
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <div className="flex flex-col gap-6">
      <TestHeaderCard
        test={test}
        typeColor={typeColor}
        isApproved={isApproved}
        mcqCount={mcqCount}
        oeCount={oeCount}
        codeCount={codeCount}
        totalMarks={totalMarks}
        actionError={actionError}
        approving={approving}
        regenerating={regenerating}
        deleting={deleting}
        onApprove={handleApprove}
        onRegenerateClick={() => setShowRegenerateConfirm(true)}
        onDeleteClick={() => setShowDeleteDialog(true)}
      />

      <QuestionListSection
        questions={questions}
        selectedIds={selectedIds}
        mcqCount={mcqCount}
        oeCount={oeCount}
        codeCount={codeCount}
        bulkDeleting={bulkDeleting}
        onToggleSelectAll={toggleSelectAll}
        onToggleSelect={toggleSelect}
        onBulkDelete={() => handleBulkDelete()}
        onQuestionUpdate={handleQuestionUpdate}
        onQuestionDelete={handleQuestionDelete}
      />

      {showRegenerateConfirm && (
        <ConfirmDialog
          title="Regenerate all questions?"
          description="Every question in this test is replaced with a freshly generated set. Any edits you have made to the current questions are lost. This cannot be undone."
          confirmLabel="Regenerate"
          confirmingLabel="Regenerating…"
          isConfirming={regenerating}
          variant="primary"
          onConfirm={handleRegenerate}
          onCancel={() => setShowRegenerateConfirm(false)}
        />
      )}

      {showDeleteDialog && (
        <DeleteTestDialog
          testTitle={test.title}
          isDeleting={deleting}
          onCancel={() => setShowDeleteDialog(false)}
          onConfirm={() => handleDelete(false)}
        />
      )}

      {forceConfirm && (
        <ConfirmDialog
          title="Question(s) already used by a candidate"
          description={
            <>
              {forceConfirm.count === 1
                ? "This question has"
                : `${forceConfirm.count} of these questions have`}{" "}
              already been assigned to a candidate&rsquo;s exam attempt. Deleting{" "}
              {forceConfirm.count === 1 ? "it" : "them"} anyway will also remove that
              candidate&rsquo;s locked record for{" "}
              {forceConfirm.count === 1 ? "this question" : "these questions"} from
              their audit trail. This cannot be undone.
            </>
          }
          confirmLabel="Delete anyway"
          confirmingLabel="Deleting…"
          isConfirming={deleting || bulkDeleting}
          variant="danger"
          onConfirm={forceConfirm.retry}
          onCancel={() => setForceConfirm(null)}
        />
      )}
    </div>
  );
}
