import type { QuestionType } from "@/types/test";

type SortableQuestion = {
  id: string;
  question_type: QuestionType;
  order_index: number;
};

const QUESTION_TYPE_ORDER: Record<QuestionType, number> = {
  MCQ: 0,
  OPEN_ENDED: 1,
  CODE: 2,
};

export function sortQuestions<T extends SortableQuestion>(questions: readonly T[]): T[] {
  return [...questions].sort((a, b) => {
    const typeDelta = QUESTION_TYPE_ORDER[a.question_type] - QUESTION_TYPE_ORDER[b.question_type];
    if (typeDelta !== 0) return typeDelta;

    const orderDelta = a.order_index - b.order_index;
    if (orderDelta !== 0) return orderDelta;

    return a.id.localeCompare(b.id);
  });
}
