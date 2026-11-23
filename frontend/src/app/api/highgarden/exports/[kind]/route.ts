import { AttemptStatus, InvitationStatus, ParseStatus, SignupStatus, TestStatus, TrackedEventType } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/server/analytics-sanitize";
import { requireHighgardenApi } from "@/server/highgarden";
import { prisma } from "@/server/prisma";
import { errorJson } from "@/server/upstream";

const KINDS = ["events", "sessions", "feedback", "funnels"] as const;
type Kind = (typeof KINDS)[number];
const ROW_LIMIT = 5000;

const parseDays = (raw: string | null) => (raw === "today" ? 1 : raw === "7" ? 7 : raw === "90" ? 90 : 30);

function since(days: number): Date {
  const d = new Date(Date.now() - days * 86_400_000);
  if (days === 1) d.setHours(0, 0, 0, 0);
  return d;
}

const csv = (kind: Kind, days: number, body: string) =>
  new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="highgarden-${kind}-${days}d.csv"`,
      "Cache-Control": "no-store",
    },
  });

async function funnels(from: Date): Promise<string> {
  const jd = { createdAt: { gte: from }, deletedAt: null };
  const counts = await Promise.all([
    prisma.invitation.count({ where: { createdAt: { gte: from } } }),
    prisma.invitation.count({ where: { createdAt: { gte: from }, status: { in: [InvitationStatus.OPENED, InvitationStatus.COMPLETED] } } }),
    prisma.testAttempt.count({ where: { startedAt: { gte: from } } }),
    prisma.testAttempt.count({ where: { submittedAt: { gte: from }, status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED] } } }),
    prisma.evaluation.count({ where: { evaluatedAt: { gte: from } } }),
    prisma.jobDescription.count({ where: jd }),
    prisma.jobDescription.count({ where: { ...jd, parseStatus: ParseStatus.DONE } }),
    prisma.jobDescription.count({ where: { ...jd, tests: { some: { deletedAt: null } } } }),
    prisma.jobDescription.count({ where: { ...jd, tests: { some: { deletedAt: null, status: TestStatus.APPROVED } } } }),
    prisma.jobDescription.count({ where: { ...jd, invitations: { some: {} } } }),
    prisma.user.count({ where: { createdAt: { gte: from } } }),
    prisma.user.count({ where: { createdAt: { gte: from }, signupStatus: SignupStatus.APPROVED } }),
    prisma.user.count({ where: { createdAt: { gte: from }, signupStatus: SignupStatus.APPROVED, jobDescriptions: { some: { deletedAt: null } } } }),
  ]);
  const steps: [string, string[]][] = [
    ["Candidate invitation to evaluation", ["Invitations created", "Invitation opened", "Test started", "Test submitted", "Evaluated"]],
    ["JD upload to candidate invite", ["JD uploaded", "Parsed", "Tests generated", "Approved tests", "Candidate invited"]],
    ["Signup to first JD", ["Signup submitted", "Approved", "First JD uploaded"]],
  ];
  let i = 0;
  const rows = steps.flatMap(([funnel, names]) => names.map((step, order) => [funnel, order + 1, step, counts[i++]]));
  return toCsv(["funnel", "step_order", "step", "count"], rows);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const gate = await requireHighgardenApi(req);
  if (gate.response) return gate.response;
  const { kind: raw } = await params;
  if (!(KINDS as readonly string[]).includes(raw)) return errorJson(404, "NOT_FOUND", "Unknown export.");
  const kind = raw as Kind;
  const days = parseDays(req.nextUrl.searchParams.get("days"));
  const from = since(days);

  if (kind === "events") {
    const events = await prisma.trackedEvent.findMany({ where: { createdAt: { gte: from } }, orderBy: { createdAt: "desc" }, take: ROW_LIMIT });
    return csv(kind, days, toCsv(
      ["created_at", "session_id", "type", "path", "target_label", "target_selector", "device_type", "browser", "os", "country", "x_pct", "y_pct"],
      events.map((e) => [e.createdAt, e.sessionId, e.type, e.path, e.targetLabel, e.targetSelector, e.deviceType, e.browserName, e.osName, e.country, e.xPct, e.yPct]),
    ));
  }
  if (kind === "sessions") {
    const sessions = await prisma.visitorSession.findMany({
      where: { lastSeenAt: { gte: from } },
      orderBy: { lastSeenAt: "desc" },
      take: ROW_LIMIT,
      include: { events: { orderBy: { createdAt: "asc" }, select: { type: true, path: true } } },
    });
    return csv(kind, days, toCsv(
      ["session_id", "first_seen_at", "last_seen_at", "event_count", "entry_path", "exit_path", "client_errors", "dead_clicks"],
      sessions.map((s) => [
        s.id, s.firstSeenAt, s.lastSeenAt, s.events.length, s.events[0]?.path, s.events.at(-1)?.path,
        s.events.filter((e) => e.type === TrackedEventType.CLIENT_ERROR).length,
        s.events.filter((e) => e.type === TrackedEventType.DEAD_CLICK).length,
      ]),
    ));
  }
  if (kind === "feedback") {
    const feedback = await prisma.highgardenFeedback.findMany({ where: { createdAt: { gte: from } }, orderBy: { createdAt: "desc" }, take: ROW_LIMIT });
    return csv(kind, days, toCsv(
      ["created_at", "session_id", "path", "rating", "category", "status", "comment"],
      feedback.map((f) => [f.createdAt, f.sessionId, f.path, f.rating, f.category, f.status, f.comment]),
    ));
  }
  return csv(kind, days, await funnels(from));
}
