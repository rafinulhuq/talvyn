import type { MCQOption, Question } from "@/types/test";

export const MCQ_LABELS: MCQOption["label"][] = ["A", "B", "C", "D"];

function optionTextState(options: MCQOption[] | null): Record<MCQOption["label"], string> {
  return MCQ_LABELS.reduce(
    (acc, label) => {
      acc[label] = options?.find((option) => option.label === label)?.text ?? "";
      return acc;
    },
    {} as Record<MCQOption["label"], string>
  );
}

// The nine editable fields below all mirror `question` and are always reset
// together (on mount, on cancel, and whenever `question.id` changes) — one
// reducer keeps that reset atomic instead of nine separate setter calls.
export function draftFromQuestion(question: Question) {
  return {
    questionText: question.question_text,
    skillTested: question.skill_tested ?? "",
    explanation: question.explanation ?? "",
    expectedAnswer: question.expected_answer ?? "",
    scoringRubric: question.scoring_rubric ?? "",
    correctAnswer: question.correct_answer ?? "A",
    codeLanguage: question.code_language ?? "",
    codeStarter: question.code_starter ?? "",
    optionTexts: optionTextState(question.options),
  };
}

export type Draft = ReturnType<typeof draftFromQuestion>;
export type DraftAction =
  | { type: "setField"; field: keyof Omit<Draft, "optionTexts">; value: string }
  | { type: "setOptionText"; label: MCQOption["label"]; value: string }
  | { type: "reset"; question: Question };

export function draftReducer(state: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value };
    case "setOptionText":
      return { ...state, optionTexts: { ...state.optionTexts, [action.label]: action.value } };
    case "reset":
      return draftFromQuestion(action.question);
  }
}
