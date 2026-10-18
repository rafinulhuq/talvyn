import { NextRequest, NextResponse } from "next/server";
import {
  AttemptStatus,
  InvitationStatus,
  ParseStatus,
  SignupStatus,
  TestStatus,
  TrackedEventType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";

type ExportKind = "events" | "sessions" | "feedback" | "funnels";

function parseDays(raw: string | null): number {
  if (raw === "today") return 1;
  if (raw === "7") return 7;
  if (raw === "90") return 90;
  return 30;
}

function startDate(days: number): Date {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (days === 1) date.setHours(0, 0, 0, 0);
  return date;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralize spreadsheet formula injection: some exported fields (targetLabel,
  // path, ...) originate from the unauthenticated /api/track endpoint, and this
  // CSV is opened by a super-admin. A cell starting with = + - @ (or a control
  // char that lets a formula follow) executes in Excel/Sheets — prefix with a
  // single quote so it's rendered as literal text.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvResponse(kind: ExportKind, days: number, csv: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="highgarden-${kind}-${days}d.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

async function funnelCsv(since: Date): Promise<string> {
  const [
    invitationsCreated,
    invitationsOpened,
    attemptsStarted,
    attemptsSubmitted,
    attemptsEvaluated,
    jdsUploaded,
    jdsParsed,
    jdsWithTests,
    jdsWithApprovedTests,
    jdsWithInvites,
    signupsSubmitted,
    signupsApproved,
    approvedUsersWithJd,
  ] = await Promise.all([
    prisma.invitation.count({ where: { createdAt: { gte: since } } }),
    prisma.invitation.count({
      where: { createdAt: { gte: since }, status: { in: [InvitationStatus.OPENED, InvitationStatus.COMPLETED] } },
    }),
    prisma.testAttempt.count({ where: { startedAt: { gte: since } } }),
    prisma.testAttempt.count({
      where: {
        submittedAt: { gte: since },
        status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED] },
      },
    }),
    prisma.evaluation.count({ where: { evaluatedAt: { gte: since } } }),
    prisma.jobDescription.count({ where: { createdAt: { gte: since }, deletedAt: null } }),
    prisma.jobDescription.count({ where: { createdAt: { gte: since }, deletedAt: null, parseStatus: ParseStatus.DONE } }),
    prisma.jobDescription.count({ where: { createdAt: { gte: since }, deletedAt: null, tests: { some: { deletedAt: null } } } }),
    prisma.jobDescription.count({
      where: { createdAt: { gte: since }, deletedAt: null, tests: { some: { deletedAt: null, status: TestStatus.APPROVED } } },
    }),
    prisma.jobDescription.count({ where: { createdAt: { gte: since }, deletedAt: null, invitations: { some: {} } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { createdAt: { gte: since }, signupStatus: SignupStatus.APPROVED } }),
    prisma.user.count({
      where: { createdAt: { gte: since }, signupStatus: SignupStatus.APPROVED, jobDescriptions: { some: { deletedAt: null } } },
    }),
  ]);

  return toCsv(
    ["funnel", "step_order", "step", "count"],
    [
      ["Candidate invitation to evaluation", 1, "Invitations created", invitationsCreated],
      ["Candidate invitation to evaluation", 2, "Invitation opened", invitationsOpened],
      ["Candidate invitation to evaluation", 3, "Test started", attemptsStarted],
      ["Candidate invitation to evaluation", 4, "Test submitted", attemptsSubmitted],
      ["Candidate invitation to evaluation", 5, "Evaluated", attemptsEvaluated],
      ["JD upload to candidate invite", 1, "JD uploaded", jdsUploaded],
      ["JD upload to candidate invite", 2, "Parsed", jdsParsed],
      ["JD upload to candidate invite", 3, "Tests generated", jdsWithTests],
      ["JD upload to candidate invite", 4, "Approved tests", jdsWithApprovedTests],
      ["JD upload to candidate invite", 5, "Candidate invited", jdsWithInvites],
      ["Signup to first JD", 1, "Signup submitted", signupsSubmitted],
      ["Signup to first JD", 2, "Approved", signupsApproved],
      ["Signup to first JD", 3, "First JD uploaded", approvedUsersWithJd],
    ]
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  await requireHighgardenAccess();
  const { kind: rawKind } = await params;
  if (!["events", "sessions", "feedback", "funnels"].includes(rawKind)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const kind = rawKind as ExportKind;
  const days = parseDays(req.nextUrl.searchParams.get("days"));
  const since = startDate(days);

  if (kind === "events") {
    const events = await prisma.trackedEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return csvResponse(
      kind,
      days,
      toCsv(
        ["created_at", "session_id", "type", "path", "target_label", "target_selector", "device_type", "browser", "os", "country", "x_pct", "y_pct"],
        events.map((event) => [
          event.createdAt,
          event.sessionId,
          event.type,
          event.path,
          event.targetLabel,
          event.targetSelector,
          event.deviceType,
          event.browserName,
          event.osName,
          event.country,
          event.xPct,
          event.yPct,
        ])
      )
    );
  }

  if (kind === "sessions") {
    const sessions = await prisma.visitorSession.findMany({
      where: { lastSeenAt: { gte: since } },
      orderBy: { lastSeenAt: "desc" },
      take: 5000,
      include: {
        events: {
          orderBy: { createdAt: "asc" },
          select: { type: true, path: true, createdAt: true },
        },
      },
    });
    return csvResponse(
      kind,
      days,
      toCsv(
        ["session_id", "first_seen_at", "last_seen_at", "event_count", "entry_path", "exit_path", "client_errors", "dead_clicks"],
        sessions.map((session) => [
          session.id,
          session.firstSeenAt,
          session.lastSeenAt,
          session.events.length,
          session.events[0]?.path,
          session.events.at(-1)?.path,
          session.events.filter((event) => event.type === TrackedEventType.CLIENT_ERROR).length,
          session.events.filter((event) => event.type === TrackedEventType.DEAD_CLICK).length,
        ])
      )
    );
  }

  if (kind === "feedback") {
    const feedback = await prisma.highgardenFeedback.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return csvResponse(
      kind,
      days,
      toCsv(
        ["created_at", "session_id", "path", "rating", "category", "status", "comment"],
        feedback.map((item) => [item.createdAt, item.sessionId, item.path, item.rating, item.category, item.status, item.comment])
      )
    );
  }

  return csvResponse(kind, days, await funnelCsv(since));
}
