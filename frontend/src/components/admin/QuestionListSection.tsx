"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import type { Question } from "@/types/test";

type QuestionListSectionProps = {
  questions: Question[];
  selectedIds: Set<string>;
  mcqCount: number;
  oeCount: number;
  codeCount: number;
  bulkDeleting: boolean;
  onToggleSelectAll: () => void;
  onToggleSelect: (questionId: string) => void;
  onBulkDelete: () => void;
  onQuestionUpdate: (updated: Question) => void;
  onQuestionDelete: (questionId: string, force?: boolean) => void;
};

export function QuestionListSection({
  questions,
  selectedIds,
  mcqCount,
  oeCount,
  codeCount,
  bulkDeleting,
  onToggleSelectAll,
  onToggleSelect,
  onBulkDelete,
  onQuestionUpdate,
  onQuestionDelete,
}: QuestionListSectionProps) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          {questions.length > 0 && (
            <input
              type="checkbox"
              checked={selectedIds.size === questions.length}
              onChange={onToggleSelectAll}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              aria-label="Select all questions"
            />
          )}
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Questions
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {questions.length} total
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{mcqCount} MCQ</span>
          <span aria-hidden="true">·</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{oeCount} Open-Ended</span>
          {codeCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{codeCount} Code</span>
            </>
          )}
        </div>
        {selectedIds.size > 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={onBulkDelete}
            loading={bulkDeleting}
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Delete selected ({selectedIds.size})
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {questions.map((question, idx) => (
          <QuestionEditor
            key={question.id}
            question={question}
            index={idx}
            onUpdate={onQuestionUpdate}
            onDelete={onQuestionDelete}
            selected={selectedIds.has(question.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}

        {questions.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              No questions generated. Click &ldquo;Regenerate&rdquo; to refill.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
