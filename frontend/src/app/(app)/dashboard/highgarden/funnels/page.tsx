import { AttemptStatus, InvitationStatus, ParseStatus, SignupStatus, TestStatus } from "@prisma/client";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { HighgardenChrome, RangeLinks } from "@/components/highgarden/hg-chrome";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { parseRange, rangeStart } from "@/lib/highgarden";
import { requireHighgardenPage } from "@/server/highgarden";
import { prisma } from "@/server/prisma";

export const metadata: Metadata = { title: "Funnels · Highgarden" };

type Step = { label: string; count: number; detail: string };
type Funnel = { title: string; description: string; steps: Step[] };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function FunnelView({ funnel }: { funnel: Funnel }) {
  const top = funnel.steps[0]?.count ?? 0;
  const max = Math.max(1, ...funnel.steps.map((s) => s.count));
  const lastStep = funnel.steps.at(-1);
  return (
    <Panel
      title={funnel.title}
      description={funnel.description}
      actions={<span className="text-sm tabular-nums text-ink-muted">{top > 0 && lastStep ? `${pct(lastStep.count, top)}% overall` : "No data"}</span>}
    >
      <ol className="flex flex-col gap-3">
        {funnel.steps.map((s, i) => {
          const prev = funnel.steps[i - 1];
          const lost = prev ? Math.max(0, prev.count - s.count) : 0;
          return (
            <li key={s.label} className="grid grid-cols-[minmax(9rem,14rem)_1fr_auto] items-center gap-4">
              <div className="min-w-0">
                <p className="truncate text-base text-ink">
                  <span className="mr-2 font-mono text-xs text-ink-faint">{i + 1}</span>
                  {s.label}
                </p>
                <p className="truncate text-sm text-ink-faint">{s.detail}</p>
              </div>
              <div className="h-6 overflow-hidden rounded-control bg-sunken" aria-hidden>
                <div className="h-full rounded-control bg-chart-1" style={{ width: `${s.count > 0 ? Math.max(1.5, (s.count / max) * 100) : 0}%` }} />
              </div>
              <div className="w-36 text-right">
                <p className="text-base tabular-nums text-ink">{s.count.toLocaleString("en")}</p>
                <p className="text-sm tabular-nums text-ink-muted">
                  {!prev
                    ? "Start"
                    : prev.count === 0
                      ? "—"
                      : lost > 0
                        ? `−${lost.toLocaleString("en")} (${pct(lost, prev.count)}%)`
                        : s.count > prev.count
                          ? `+${(s.count - prev.count).toLocaleString("en")}` // more than the step before: not a strict cohort
                          : "100% kept"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export default async function HighgardenFunnelsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireHighgardenPage();
  const sp = await searchParams;
  const range = parseRange(sp.days);
  const since = rangeStart(range.days);
  const jd = { createdAt: { gte: since }, deletedAt: null };
  const users = { createdAt: { gte: since } };

  const [invites, opened, started, submitted, evaluated, jds, parsed, withTests, approved, invited, signups, approvedUsers, activated] = await Promise.all([
    prisma.invitation.count({ where: { createdAt: { gte: since } } }),
    prisma.invitation.count({ where: { createdAt: { gte: since }, status: { in: [InvitationStatus.OPENED, InvitationStatus.COMPLETED] } } }),
    prisma.testAttempt.count({ where: { startedAt: { gte: since } } }),
    prisma.testAttempt.count({ where: { submittedAt: { gte: since }, status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED] } } }),
    prisma.evaluation.count({ where: { evaluatedAt: { gte: since } } }),
    prisma.jobDescription.count({ where: jd }),
    prisma.jobDescription.count({ where: { ...jd, parseStatus: ParseStatus.DONE } }),
    prisma.jobDescription.count({ where: { ...jd, tests: { some: { deletedAt: null } } } }),
    prisma.jobDescription.count({ where: { ...jd, tests: { some: { deletedAt: null, status: TestStatus.APPROVED } } } }),
    prisma.jobDescription.count({ where: { ...jd, invitations: { some: {} } } }),
    prisma.user.count({ where: users }),
    prisma.user.count({ where: { ...users, signupStatus: SignupStatus.APPROVED } }),
    prisma.user.count({ where: { ...users, signupStatus: SignupStatus.APPROVED, jobDescriptions: { some: { deletedAt: null } } } }),
  ]);

  const funnels: Funnel[] = [
    {
      title: "Invitation to score",
      description: "Do invited candidates finish and get scored?",
      steps: [
        { label: "Invited", count: invites, detail: "Invitations created" },
        { label: "Opened", count: opened, detail: "Invitation opened or completed" },
        { label: "Started", count: started, detail: "Test attempts started" },
        { label: "Submitted", count: submitted, detail: "Submitted or scored attempts" },
        { label: "Scored", count: evaluated, detail: "Evaluations created" },
      ],
    },
    {
      title: "Job description to invitation",
      description: "Do recruiters turn an uploaded JD into invitations?",
      steps: [
        { label: "JD uploaded", count: jds, detail: "Not in trash" },
        { label: "Parsed", count: parsed, detail: "Parsing finished" },
        { label: "Tests generated", count: withTests, detail: "At least one test" },
        { label: "Test approved", count: approved, detail: "At least one approved test" },
        { label: "Candidate invited", count: invited, detail: "At least one invitation" },
      ],
    },
    {
      title: "Sign-up to first JD",
      description: "Do new accounts get approved and start using Talvyn?",
      steps: [
        { label: "Signed up", count: signups, detail: "Accounts created" },
        { label: "Approved", count: approvedUsers, detail: "Sign-up approved" },
        { label: "First JD", count: activated, detail: "Approved and uploaded a JD" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <HighgardenChrome
        section="funnels"
        title="Funnels"
        description="Conversion through Talvyn's main workflows, from the product's own records."
        actions={
          <>
            <Button asChild variant="secondary">
              <a href={`/api/highgarden/exports/funnels?days=${range.key}`} download>
                <Download aria-hidden className="size-4" /> CSV
              </a>
            </Button>
            <RangeLinks base="/dashboard/highgarden/funnels" current={range.key} params={{ days: sp.days }} />
          </>
        }
      />
      <p className="-mt-3 max-w-3xl text-sm text-ink-muted">
        Each step counts records whose own date falls in the range (an attempt by its start or submit date, a JD by its upload date). Steps near the range edge can come from different people, so treat these as rates, not a strict cohort.
      </p>
      {funnels.map((f) => (
        <FunnelView key={f.title} funnel={f} />
      ))}
    </div>
  );
}
