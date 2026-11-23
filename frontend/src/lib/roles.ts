/**
 * Role hierarchy, mirrored from backend/app/dependencies.py ROLE_RANK.
 * DEV is deliberately NOT ranked: it unlocks the docs and nothing else, so it
 * can never satisfy a roleAtLeast() check by accident (unknown → rank 0).
 */
export const ROLE_RANK = { USER: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;
export type RankedRole = keyof typeof ROLE_RANK;
export type Role = RankedRole | "DEV";

export function roleAtLeast(role: string | null | undefined, min: RankedRole): boolean {
  const rank = role && role in ROLE_RANK ? ROLE_RANK[role as RankedRole] : 0;
  return rank >= ROLE_RANK[min];
}

export const canViewDocs = (role: string | null | undefined) => role === "DEV" || roleAtLeast(role, "ADMIN");
