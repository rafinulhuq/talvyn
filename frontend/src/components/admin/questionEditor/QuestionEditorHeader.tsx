import { Badge } from "@/components/ui/Badge";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { Question } from "@/types/test";

const difficultyColor: Record<string, "green" | "yellow" | "red"> = {
  EASY: "green",
  MEDIUM: "yellow",
  HARD: "red",
};

interface Props {
  question: Question;
  index: number;
  expanded: boolean;
  editing: boolean;
  selected: boolean;
  onToggleSelect?: (id: string) => void;
  contentId: string;
  onToggleExpand: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
}

export function QuestionEditorHeader({
  question,
  index,
  expanded,
  editing,
  selected,
  onToggleSelect,
  contentId,
  onToggleExpand,
  onEdit,
  onRequestDelete,
}: Props) {
  const isMCQ = question.question_type === "MCQ";
  const isCode = question.question_type === "CODE";

  return (
    // Header row — the badges, the skill label and the marks used to sit on
    // one non-shrinking line, so on a phone the row overflowed its card and
    // the marks text ran underneath the edit/delete icons. The summary now
    // wraps onto a second line below `sm` and the controls keep their own
    // column.
    <div className="flex items-start gap-2 px-3 py-2.5 sm:items-center sm:gap-3 sm:px-4 sm:py-3">
      {/* Bulk-select checkbox */}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(question.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 sm:mt-0"
          aria-label={`Select question ${index + 1}`}
        />
      )}

      <button
        type="button"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 py-1 text-left sm:flex-nowrap sm:gap-3 sm:py-0"
        onClick={() => !editing && onToggleExpand()}
        aria-expanded={expanded || editing}
        aria-controls={contentId}
        disabled={editing}
      >
        {/* Index + type */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-indigo-200/80 bg-indigo-50 text-xs font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
          {index + 1}
        </span>
        <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {isMCQ ? "MCQ" : isCode ? "Code" : "Open-ended"}
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${
            question.difficulty === "EASY"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400"
              : question.difficulty === "HARD"
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400"
          }`}
        >
          {question.difficulty}
        </span>
        <span className="flex w-full min-w-0 items-center gap-2 sm:contents">
          {question.skill_tested && (
            <span className="min-w-0 truncate text-xs font-medium text-slate-500 dark:text-slate-400 sm:flex-1">
              {question.skill_tested}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {question.marks} mark{question.marks !== 1 ? "s" : ""}
          </span>
        </span>
      </button>

      {/* Edit / expand controls */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-lg border border-white/10 p-1.5 text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
          aria-label={`Edit question ${index + 1}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete();
          }}
          className="rounded-lg border border-white/10 p-1.5 text-white/80 transition-colors hover:border-[#F87171]/40 hover:bg-[#F87171]/10 hover:text-[#F87171]"
          aria-label={`Delete question ${index + 1}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {!editing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="rounded-lg border border-white/10 p-1.5 text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
            aria-label={`${expanded ? "Collapse" : "Expand"} question ${index + 1}`}
            aria-expanded={expanded}
            aria-controls={contentId}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
