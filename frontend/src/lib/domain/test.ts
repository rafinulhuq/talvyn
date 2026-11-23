import type { BadgeTone } from "@/components/ui/badge";
import type { Difficulty, DifficultyMix, QuestionType, TestStatus, TestType } from "@/types/test";

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  TECHNICAL: "Technical",
  REASONING: "Reasoning",
  PROBLEM_SOLVING: "Problem solving",
  PRACTICAL: "Practical",
};
export const testTypeLabel = (t: string) => TEST_TYPE_LABEL[t as TestType] ?? t;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard", MIXED: "Mixed" };

export const QUESTION_TYPE_LABEL: Record<QuestionType, { one: string; many: string }> = {
  MCQ: { one: "Multiple choice", many: "Multiple choice" },
  OPEN_ENDED: { one: "Written answer", many: "Written answers" },
  CODE: { one: "Code", many: "Code" },
};

export function testStatusBadge(status: TestStatus): { label: string; tone: BadgeTone } {
  if (status === "APPROVED") return { label: "Approved", tone: "success" };
  if (status === "ARCHIVED") return { label: "Archived", tone: "neutral" };
  return { label: "Draft", tone: "warning" };
}

const TYPE_ORDER: Record<QuestionType, number> = { MCQ: 0, OPEN_ENDED: 1, CODE: 2 };

/** Candidates see multiple choice first, then written, then code; stable within a type. */
export function sortQuestions<T extends { id: string; question_type: QuestionType; order_index: number }>(qs: readonly T[]): T[] {
  return [...qs].sort(
    (a, b) => TYPE_ORDER[a.question_type] - TYPE_ORDER[b.question_type] || a.order_index - b.order_index || a.id.localeCompare(b.id),
  );
}

export const DEFAULT_MIX: DifficultyMix = { easy_percent: 30, medium_percent: 50, hard_percent: 20 };

/** Reads the analysis' suggested mix; falls back to the default when it's missing or doesn't add up. */
export function mixFrom(raw: Record<string, unknown> | null | undefined): DifficultyMix {
  const n = (k: string) => (typeof raw?.[k] === "number" ? Math.round(raw[k] as number) : NaN);
  const mix = { easy_percent: n("easy_percent"), medium_percent: n("medium_percent"), hard_percent: n("hard_percent") };
  const ok = Object.values(mix).every((v) => Number.isFinite(v) && v >= 0) && mix.easy_percent + mix.medium_percent + mix.hard_percent === 100;
  return ok ? mix : DEFAULT_MIX;
}

/** Plural helper for counts in sentences. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Backend progress step names end in "…" or "."; the UI adds its own punctuation. */
export const tidyStep = (step: string) => step.replace(/[.…\s]+$/u, "");
