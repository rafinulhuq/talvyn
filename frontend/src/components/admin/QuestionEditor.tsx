/**
 * QuestionEditor
 *
 * Inline-editable card for a single question.
 * Supports MCQ (shows options + correct answer), OPEN_ENDED
 * (shows expected answer + rubric), and CODE (shows language,
 * starter code, plus expected answer + rubric).
 *
 * Edit mode: all fields become editable text inputs.
 * Save: calls PATCH /api/v1/tests/questions/{id}.
 * Cancel: resets to original values.
 */

"use client";

import { useId, useReducer, useState } from "react";
import { clsx } from "clsx";
import { Save, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { testsApi } from "@/lib/api/tests";
import type { Question, UpdateQuestionRequest } from "@/types/test";
import { FieldBlock } from "./questionEditor/FieldBlock";
import { QuestionEditorHeader } from "./questionEditor/QuestionEditorHeader";
import { McqFields } from "./questionEditor/McqFields";
import { CodeFields } from "./questionEditor/CodeFields";
import { OpenEndedFields } from "./questionEditor/OpenEndedFields";
import { MCQ_LABELS, draftFromQuestion, draftReducer } from "./questionEditor/questionDraft";

interface QuestionEditorProps {
  question: Question;
  index: number;
  onUpdate: (updated: Question) => void;
  onDelete: (id: string) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

// expanded/editing always moved together: pencil-click jumps straight from
// either state to "editing"; save/cancel land on "expanded" (content stays
// visible, no longer editable); only a question switch collapses it.
type ViewState = "collapsed" | "expanded" | "editing";

type SaveStatus = { phase: "idle" } | { phase: "saving" } | { phase: "error"; message: string };

export function QuestionEditor({
  question,
  index,
  onUpdate,
  onDelete,
  selected = false,
  onToggleSelect,
}: QuestionEditorProps) {
  const [view, setView] = useState<ViewState>("collapsed");
  const expanded = view !== "collapsed";
  const editing = view === "editing";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ phase: "idle" });
  const saving = saveStatus.phase === "saving";
  const error = saveStatus.phase === "error" ? saveStatus.message : null;
  // Replaces window.confirm — an unstyled system prompt in the middle of an
  // otherwise themed surface, and on iOS a sheet that looks like the browser
  // asking, not the app.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contentId = useId();

  const [draft, dispatchDraft] = useReducer(draftReducer, question, draftFromQuestion);
  const {
    questionText,
    skillTested,
    explanation,
    expectedAnswer,
    scoringRubric,
    correctAnswer,
    codeLanguage,
    codeStarter,
    optionTexts,
  } = draft;

  async function handleSave() {
    setSaveStatus({ phase: "saving" });

    const payload: UpdateQuestionRequest = {
      question_text: questionText,
      skill_tested: skillTested || null,
    };

    if (question.question_type === "MCQ") {
      payload.explanation = explanation;
      payload.correct_answer = correctAnswer;
      payload.options = MCQ_LABELS.map((label) => ({
        label,
        text: optionTexts[label],
        is_correct: label === correctAnswer,
      }));
    } else {
      payload.expected_answer = expectedAnswer;
      payload.scoring_rubric = scoringRubric;
      if (question.question_type === "CODE") {
        payload.code_language = codeLanguage || null;
        payload.code_starter = codeStarter || null;
      }
    }

    try {
      const result = await testsApi.updateQuestion(question.id, payload);

      if (!result.success) {
        setSaveStatus({ phase: "error", message: result.error.message ?? "Failed to save." });
        return;
      }

      setSaveStatus({ phase: "idle" });
      setView("expanded");
      onUpdate(result.data);
    } finally {
      setSaveStatus((prev) => (prev.phase === "saving" ? { phase: "idle" } : prev));
    }
  }

  function handleCancel() {
    dispatchDraft({ type: "reset", question });
    setView("expanded");
    setSaveStatus({ phase: "idle" });
  }

  const isMCQ = question.question_type === "MCQ";
  const isCode = question.question_type === "CODE";

  return (
    <div
      className={clsx(
        "rounded-xl border transition-all shadow-xs overflow-hidden",
        editing
          ? "border-indigo-300 bg-slate-50/70 ring-1 ring-indigo-500/20 dark:border-indigo-800 dark:bg-slate-800/40"
          : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
      )}
    >
      <QuestionEditorHeader
        question={question}
        index={index}
        expanded={expanded}
        editing={editing}
        selected={selected}
        onToggleSelect={onToggleSelect}
        contentId={contentId}
        onToggleExpand={() => setView((v) => (v === "expanded" ? "collapsed" : "expanded"))}
        onEdit={() => setView("editing")}
        onRequestDelete={() => setConfirmDelete(true)}
      />

      {/* Expanded content */}
      {(expanded || editing) && (
        <div id={contentId} className="flex flex-col gap-4 border-t border-slate-100 px-4 pb-4 pt-4 dark:border-slate-800">
          {/* Question text */}
          <FieldBlock label="Question">
            {editing ? (
              <textarea
                value={questionText}
                onChange={(e) => dispatchDraft({ type: "setField", field: "questionText", value: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 resize-none"
                rows={3}
              />
            ) : (
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-normal">{question.question_text}</p>
            )}
          </FieldBlock>

          {/* Skill tested */}
          <FieldBlock label="Skill Tested">
            {editing ? (
              <input
                type="text"
                value={skillTested}
                onChange={(e) => dispatchDraft({ type: "setField", field: "skillTested", value: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-400">{question.skill_tested ?? "—"}</p>
            )}
          </FieldBlock>

          {isMCQ && (
            <McqFields
              question={question}
              editing={editing}
              correctAnswer={correctAnswer}
              optionTexts={optionTexts}
              explanation={explanation}
              dispatchDraft={dispatchDraft}
            />
          )}

          {isCode && (
            <CodeFields
              question={question}
              editing={editing}
              codeLanguage={codeLanguage}
              codeStarter={codeStarter}
              dispatchDraft={dispatchDraft}
            />
          )}

          {!isMCQ && (
            <OpenEndedFields
              question={question}
              editing={editing}
              expectedAnswer={expectedAnswer}
              scoringRubric={scoringRubric}
              dispatchDraft={dispatchDraft}
            />
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Edit actions */}
          {editing && (
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
              <Button
                onClick={handleSave}
                loading={saving}
                size="sm"
                leftIcon={<Save className="h-3.5 w-3.5" />}
              >
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
                size="sm"
                leftIcon={<X className="h-3.5 w-3.5" />}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete question ${index + 1}?`}
          description="The question and its answer key are permanently removed from this test. This cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete(question.id);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
