import Link from "next/link";
import { AttemptStatus, InvitationStatus, ParseStatus, SignupStatus, TestStatus } from "@prisma/client";
import { ArrowDown, GitBranch } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";
import { HighgardenSectionHeader } from "../HighgardenSectionHeader";

type SearchParams = { days?: string };

type FunnelStep = {
  label: string;
  count: number;
  detail: string;
};

type Funnel = {
  title: string;
  subtitle: string;
  steps: FunnelStep[];
};

function startDate(days: number): Date {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (days === 1) date.setHours(0, 0, 0, 0);
  return date;
}

function parseDays(raw: string | undefined): number {
  if (raw === "today") return 1;
  if (raw === "90") return 90;
  if (raw === "7") return 7;
  return 30;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function dropOff(previous: number, current: number): string {
  if (previous === 0) return "No prior step";
  const lost = Math.max(0, previous - current);
  return `${lost.toLocaleString()} dropped (${pct(lost, previous)}%)`;
}

export default async function HighgardenFunnelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireHighgardenAccess();
  const params = await searchParams;
  const days = parseDays(params.days);
  const selectedPreset = params.days === "today" ? "today" : String(days);
  const since = startDate(days);

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
    prisma.jobDescription.count({
      where: { createdAt: { gte: since }, deletedAt: null, parseStatus: ParseStatus.DONE },
    }),
    prisma.jobDescription.count({
      where: { createdAt: { gte: since }, deletedAt: null, tests: { some: { deletedAt: null } } },
    }),
    prisma.jobDescription.count({
      where: {
        createdAt: { gte: since },
        deletedAt: null,
        tests: { some: { deletedAt: null, status: TestStatus.APPROVED } },
      },
    }),
    prisma.jobDescription.count({
      where: { createdAt: { gte: since }, deletedAt: null, invitations: { some: {} } },
    }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({
      where: { createdAt: { gte: since }, signupStatus: SignupStatus.APPROVED },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: since },
        signupStatus: SignupStatus.APPROVED,
        jobDescriptions: { some: { deletedAt: null } },
      },
    }),
  ]);

  const funnels: Funnel[] = [
    {
      title: "Candidate invitation to evaluation",
      subtitle: "Whether invited candidates reach a completed, evaluated assessment.",
      steps: [
        { label: "Invitations created", count: invitationsCreated, detail: "Candidate invite records created" },
        { label: "Invitation opened", count: invitationsOpened, detail: "Invitation marked opened or completed" },
        { label: "Test started", count: attemptsStarted, detail: "At least one test attempt started" },
        { label: "Test submitted", count: attemptsSubmitted, detail: "Submitted or evaluated attempts" },
        { label: "Evaluated", count: attemptsEvaluated, detail: "Evaluation rows created" },
      ],
    },
    {
      title: "JD upload to candidate invite",
      subtitle: "Whether admins turn uploaded job descriptions into usable candidate invites.",
      steps: [
        { label: "JD uploaded", count: jdsUploaded, detail: "Non-trashed JDs created" },
        { label: "Parsed", count: jdsParsed, detail: "JD parse status is DONE" },
        { label: "Tests generated", count: jdsWithTests, detail: "JD has at least one test" },
        { label: "Approved tests", count: jdsWithApprovedTests, detail: "JD has an approved test" },
        { label: "Candidate invited", count: jdsWithInvites, detail: "JD has at least one invitation" },
      ],
    },
    {
      title: "Signup to first JD",
      subtitle: "Whether new approved users activate by uploading their first job description.",
      steps: [
        { label: "Signup submitted", count: signupsSubmitted, detail: "User rows created" },
        { label: "Approved", count: signupsApproved, detail: "Signup status is APPROVED" },
        { label: "First JD uploaded", count: approvedUsersWithJd, detail: "Approved user has at least one active JD" },
      ],
    },
  ];

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <HighgardenSectionHeader title="Funnels" description="Critical Talvyn workflows and where people drop off." />
        <div className="flex gap-2">
          {[
            { value: "today", label: "Today" },
            { value: "7", label: "7d" },
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
          ].map((preset) => (
            <Link
              key={preset.value}
              href={`/dashboard/highgarden/funnels?days=${preset.value}`}
              className={
                selectedPreset === preset.value
                  ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
                  : "rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }
            >
              {preset.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6">
        {funnels.map((funnel) => (
          <FunnelCard key={funnel.title} funnel={funnel} />
        ))}
      </div>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: Funnel }) {
  const first = funnel.steps[0]?.count ?? 0;
  return (
    <section className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-slate-900">
          <GitBranch className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{funnel.title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{funnel.subtitle}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        {funnel.steps.map((step, index) => {
          const previous = funnel.steps[index - 1];
          const conversion = index === 0 ? 100 : pct(step.count, first);
          const stepConversion = previous ? pct(step.count, previous.count) : 100;
          return (
            <div key={step.label} className="relative rounded-xl bg-white p-4 dark:bg-slate-900">
              {index > 0 && (
                <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-400 lg:hidden">
                  <ArrowDown className="h-3.5 w-3.5" />
                  {dropOff(previous.count, step.count)}
                </div>
              )}
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{step.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{step.count.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{step.detail}</p>
              <div className="mt-4 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-2 rounded-full bg-brand-400" style={{ width: `${conversion}%` }} />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {index === 0 ? "100% start" : `${stepConversion}% from previous · ${conversion}% overall`}
              </p>
              {previous && <p className="mt-1 hidden text-xs text-slate-400 lg:block">{dropOff(previous.count, step.count)}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
