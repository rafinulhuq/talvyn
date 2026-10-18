/**
 * Shared TypeScript type definitions.
 * These mirror the Prisma schema and FastAPI Pydantic schemas.
 *
 * Module-specific types live in their own files (jd.ts, test.ts, etc.)
 * and will be added as each module is built.
 */

// ─── Enums ────────────────────────────────────────────────────

// DEV is a docs-only role (see src/lib/docs.ts) — deliberately left out of
// ROLE_RANK below so it never satisfies a roleAtLeast() check.
export type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN" | "DEV";

/** Role hierarchy rank (least → most privileged) for min-role comparisons. */
export const ROLE_RANK: Partial<Record<UserRole, number>> = {
  USER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/** True when `role` meets or exceeds `minRole` in the hierarchy. */
export function roleAtLeast(role: string | null | undefined, minRole: UserRole): boolean {
  const rank = ROLE_RANK[(role as UserRole)] ?? 0;
  return rank >= (ROLE_RANK[minRole] ?? 0);
}

export type FileType = "PDF" | "DOCX";

export type ParseStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";

export type TestType = "TECHNICAL" | "REASONING" | "PROBLEM_SOLVING";

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "MIXED";

export type TestStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

export type QuestionType = "MCQ" | "OPEN_ENDED" | "CODE";

export type GenerationStatus =
  | "IDLE"
  | "DRAFTING"
  | "EXTRACTING"
  | "GENERATING"
  | "READY"
  | "FAILED";

export type JdSource = "UPLOADED" | "GENERATED";

export type InvitationStatus =
  | "PENDING"
  | "OPENED"
  | "COMPLETED"
  | "EXPIRED"
  | "REVOKED";

export type AttemptStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "EVALUATED";

export type AIRecommendation = "STRONG_HIRE" | "HIRE" | "MAYBE" | "NO_HIRE";

// ─── User ─────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// ─── Session extension ────────────────────────────────────────
// Augments next-auth Session type with our custom fields

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
  }
}

// ─── API Response wrappers ────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
