import { clsx } from "clsx";
import { CheckCircle } from "lucide-react";
import type { Dispatch } from "react";
import type { Question } from "@/types/test";
import { FieldBlock } from "./FieldBlock";
import { MCQ_LABELS, type Draft, type DraftAction } from "./questionDraft";

interface Props {
  question: Question;
  editing: boolean;
  correctAnswer: Draft["correctAnswer"];
  optionTexts: Draft["optionTexts"];
  explanation: string;
  dispatchDraft: Dispatch<DraftAction>;
}

export function McqFields({ question, editing, correctAnswer, optionTexts, explanation, dispatchDraft }: Props) {
  if (!question.options) return null;

  return (
    <>
      <FieldBlock label="Options">
        <div className="flex flex-col gap-1.5">
          {MCQ_LABELS.map((label) => {
            const opt = question.options?.find((option) => option.label === label);
            return (
              <div
                key={label}
                className={clsx(
                  "flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm",
                  label === (editing ? correctAnswer : question.correct_answer)
                    ? "bg-success-light border border-success/20"
                    : "bg-white dark:bg-slate-900"
                )}
              >
                {editing ? (
                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={label === correctAnswer}
                    onChange={() => dispatchDraft({ type: "setField", field: "correctAnswer", value: label })}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600 sm:h-4 sm:w-4"
                  />
                ) : label === question.correct_answer ? (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <span className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span className="font-medium text-slate-700 shrink-0">{label}.</span>
                {editing ? (
                  <textarea
                    value={optionTexts[label]}
                    onChange={(e) => dispatchDraft({ type: "setOptionText", label, value: e.target.value })}
                    className="min-h-10 flex-1 resize-none rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    rows={2}
                  />
                ) : (
                  <span className="text-slate-700">{opt?.text ?? "—"}</span>
                )}
              </div>
            );
          })}
        </div>
      </FieldBlock>

      <FieldBlock label="Explanation">
        {editing ? (
          <textarea
            value={explanation}
            onChange={(e) => dispatchDraft({ type: "setField", field: "explanation", value: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
            rows={2}
          />
        ) : (
          <p className="text-sm text-slate-600">{question.explanation}</p>
        )}
      </FieldBlock>
    </>
  );
}
