import type { Recommendation } from "@/types/invitation";

/**
 * Score bands the backend uses (evaluation_service._score_to_recommendation).
 * The AI may recommend lower than its band, never higher.
 */
export const BANDS: { rec: Recommendation; label: string; from: number; to: number | null }[] = [
  { rec: "STRONG_HIRE", label: "Strong hire", from: 80, to: null },
  { rec: "HIRE", label: "Hire", from: 65, to: 79 },
  { rec: "MAYBE", label: "Maybe", from: 45, to: 64 },
  { rec: "NO_HIRE", label: "No hire", from: 0, to: 44 },
];

export const LEVEL_LABEL: Record<string, string> = { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced", EXPERT: "Expert" };
export const levelLabel = (l: string | null | undefined) => (l ? (LEVEL_LABEL[l] ?? l.charAt(0) + l.slice(1).toLowerCase()) : null);

/** The decision that counts: a reviewer's override, otherwise the AI's. */
export const effectiveRecommendation = (ai: Recommendation | null, override: Recommendation | null) => override ?? ai;

/** Percent as shown everywhere: whole numbers, never "NaN%". */
export const pct = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "–" : `${Math.round(v)}%`);

/** pass_rate arrives as a 0–100 percentage from the leaderboard/report endpoints. */
export const ratePct = (v: number | null | undefined) => (v == null ? "No pass mark" : `${Math.round(v)}%`);

/** skill_breakdown is { skill: percent 0–100 } (evaluation_service._compute_skill_breakdown). */
export function skillScores(raw: Record<string, unknown>): { skill: string; score: number }[] {
  return Object.entries(raw ?? {})
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
    .map(([skill, score]) => ({ skill, score: Math.max(0, Math.min(100, score)) }))
    .sort((a, b) => b.score - a.score);
}
