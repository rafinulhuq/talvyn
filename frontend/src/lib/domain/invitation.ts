import type { BadgeTone } from "@/components/ui/badge";
import type { InvitationStatus, Recommendation } from "@/types/invitation";

export const INVITATION_STATUS: Record<InvitationStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Invited", tone: "neutral" },
  OPENED: { label: "Opened", tone: "accent" },
  COMPLETED: { label: "Completed", tone: "success" },
  EXPIRED: { label: "Expired", tone: "warning" },
  REVOKED: { label: "Revoked", tone: "neutral" },
  TERMINATED: { label: "Ended for integrity", tone: "danger" },
};
export const invitationStatus = (s: string) => INVITATION_STATUS[s as InvitationStatus] ?? { label: s, tone: "neutral" as BadgeTone };

/** Invitations that can still be resent or revoked. */
export const isOpenInvitation = (s: InvitationStatus) => s === "PENDING" || s === "OPENED" || s === "EXPIRED";

export const RECOMMENDATION: Record<Recommendation, { label: string; tone: BadgeTone }> = {
  STRONG_HIRE: { label: "Strong hire", tone: "success" },
  HIRE: { label: "Hire", tone: "success" },
  MAYBE: { label: "Maybe", tone: "warning" },
  NO_HIRE: { label: "No hire", tone: "danger" },
};

export const ATTEMPT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "accent" },
  SUBMITTED: { label: "Awaiting scoring", tone: "warning" },
  EVALUATED: { label: "Scored", tone: "success" },
  TERMINATED: { label: "Ended for integrity", tone: "danger" },
};
export const attemptStatus = (s: string) => ATTEMPT_STATUS[s] ?? { label: s, tone: "neutral" as BadgeTone };

export const EXAM_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ASSIGNED: { label: "Not started", tone: "neutral" },
  STARTED: { label: "In progress", tone: "accent" },
  SECTION_SUBMITTED: { label: "In progress", tone: "accent" },
  SUBMITTED: { label: "Awaiting scoring", tone: "warning" },
  EVALUATING: { label: "Scoring", tone: "accent" },
  EVALUATED: { label: "Scored", tone: "success" },
  FAILED: { label: "Scoring failed", tone: "danger" },
};
export const examStatus = (s: string) => EXAM_STATUS[s] ?? { label: s, tone: "neutral" as BadgeTone };

export const MAX_BULK_ROWS = 50;
const EMAIL = /^[^\s@,;"]+@[^\s@,;"]+\.[^\s@,;"]+$/;

export type CsvRow = { line: number; email: string; name: string; error?: string };

function splitLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      cells.push(cur);
      cur = "";
    }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parses a candidate list: CSV or semicolon-separated, header optional
 * (an "email" column is found by name; otherwise column 1 is email, column 2 name).
 * Duplicate emails are dropped. Rows keep their source line for error messages.
 */
export function parseCandidateCsv(text: string): { rows: CsvRow[]; duplicates: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l, i) => ({ l, i: i + 1 })).filter(({ l }) => l.trim());
  if (!lines.length) return { rows: [], duplicates: 0 };
  const first = lines[0]!.l;
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = splitLine(first, delim).map((c) => c.toLowerCase());
  const emailHead = head.findIndex((c) => c === "email" || c === "e-mail" || c === "email address");
  const hasHeader = emailHead !== -1;
  const emailCol = hasHeader ? emailHead : 0;
  const nameCol = hasHeader ? head.findIndex((c) => c === "name" || c === "full name" || c === "candidate name") : 1;

  const seen = new Set<string>();
  let duplicates = 0;
  const rows: CsvRow[] = [];
  for (const { l, i } of hasHeader ? lines.slice(1) : lines) {
    const cells = splitLine(l, delim);
    const email = (cells[emailCol] ?? "").toLowerCase();
    if (email && seen.has(email)) {
      duplicates++;
      continue;
    }
    if (email) seen.add(email);
    const name = nameCol >= 0 ? (cells[nameCol] ?? "") : "";
    rows.push({ line: i, email, name, error: !email ? "No email address" : EMAIL.test(email) ? undefined : "Not a valid email address" });
  }
  return { rows, duplicates };
}
