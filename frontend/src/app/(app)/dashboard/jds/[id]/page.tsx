import { ArrowRight, Check, FileUp, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AnalyzeButton, JdMenu } from "@/components/jd/jd-actions";
import { JdLiveStatus } from "@/components/jd/jd-live-status";
import { JdTextPanel } from "@/components/jd/jd-text-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { displaySeniority, jdStatus, jdTitle } from "@/lib/domain/jd";
import { formatDate } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { JdStatus, JobDescription, Paginated } from "@/types/jd";
import type { TestSummary } from "@/types/test";

type Props = { params: Promise<{ id: string }> };

const getJd = cache((id: string) => serverGet<JobDescription>(`/api/v1/jd/${encodeURIComponent(id)}?include_raw_text=true`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const res = await getJd((await params).id);
  return { title: res.ok ? jdTitle({ job_title: res.data.extracted_data?.job_title ?? null, original_filename: res.data.original_filename }) : "Job description" };
}

function SkillList({ title, items, tone = "neutral" }: { title: string; items: string[]; tone?: "neutral" | "accent" }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm text-ink-muted">{title}</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((s) => (
          <li key={s}>
            <Badge tone={tone} className="h-6 px-2 text-sm font-normal">
              {s}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function JdDetailPage({ params }: Props) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const jdRes = await getJd(id);
  if (!jdRes.ok) {
    if (jdRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(jdRes.status)} />;
  }
  const jd = jdRes.data;
  const [statusRes, testsRes, invitesRes] = await Promise.all([
    serverGet<JdStatus>(`/api/v1/jd/${id}/status`),
    serverGet<TestSummary[]>(`/api/v1/tests/jd/${id}`),
    serverGet<Paginated<unknown>>(`/api/v1/invitations/jd/${id}?page=1&page_size=1`),
  ]);

  const x = jd.extracted_data;
  const title = jdTitle({ job_title: x?.job_title ?? null, original_filename: jd.original_filename });
  const status = statusRes.ok
    ? statusRes.data
    : { id, parse_status: jd.parse_status, generation_status: jd.generation_status, has_extracted_data: !!x, has_tests: false, error_message: null };
  const s = jdStatus(jd.parse_status, jd.generation_status, !!x);
  const tests = testsRes.ok ? testsRes.data : [];
  const invited = invitesRes.ok ? invitesRes.data.total : 0;
  const parsed = jd.parse_status === "DONE";

  // A real sequence, so numbered steps are honest here.
  const steps = [
    { label: "Text ready", done: parsed },
    { label: "Skills extracted", done: !!x },
    { label: "Tests generated", done: tests.length > 0 },
    { label: "Candidates invited", done: invited > 0 },
  ];
  const next =
    !parsed || s.busy
      ? null
      : !x
        ? {
            title: "Analyse the skills",
            body:
              jd.source === "GENERATED"
                ? "Read the draft below and edit anything that isn't right, then analyse it."
                : "Check the text below, fix anything the file import got wrong, then analyse it.",
            action: <AnalyzeButton jdId={id} again={false} />,
          }
        : tests.length === 0
          ? { title: "Generate the assessment", body: "Three tests built from these skills: technical, reasoning and problem solving.", href: `/dashboard/jds/${id}/tests`, cta: "Set up tests" }
          : invited === 0
            ? { title: "Invite candidates", body: "Send private links by email, or share one public link.", href: `/dashboard/jds/${id}/invite`, cta: "Invite candidates" }
            : { title: `${invited} ${invited === 1 ? "candidate" : "candidates"} invited`, body: "Follow their progress and results.", href: `/dashboard/jds/${id}/candidates`, cta: "View candidates" };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Job descriptions", href: "/dashboard/jds" }, { label: title }]}
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Badge tone={s.tone} dot>
              {s.label}
            </Badge>
            {x?.seniority_level && <span>{displaySeniority(x.seniority_level)} level</span>}
            <span className="inline-flex items-center gap-1.5">
              {jd.source === "GENERATED" ? <Sparkles aria-hidden className="size-3.5" /> : <FileUp aria-hidden className="size-3.5" />}
              {jd.source === "GENERATED" ? "Written from a brief" : jd.original_filename}
            </span>
            <span>Added {formatDate(jd.created_at)}</span>
          </span>
        }
        actions={
          <>
            {x && parsed && !s.busy && <AnalyzeButton jdId={id} again />}
            <JdMenu jdId={id} title={title} canRegenerate={jd.source === "GENERATED"} />
          </>
        }
        className="pb-0"
      />

      <JdLiveStatus jdId={id} initial={status} errorMessage={status.error_message} />

      <ol aria-label="Progress" className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2.5 bg-surface px-4 py-3">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium",
                step.done ? "border-accent bg-accent text-accent-ink" : "border-line-strong text-ink-muted",
              )}
            >
              {step.done ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("text-base", step.done ? "text-ink" : "text-ink-muted")}>
              {step.label}
              <span className="sr-only">{step.done ? ", done" : ", not done"}</span>
            </span>
          </li>
        ))}
      </ol>

      {next && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-line bg-surface px-5 py-4">
          <div>
            <p className="text-md font-medium text-ink">{next.title}</p>
            <p className="mt-0.5 text-base text-ink-muted">{next.body}</p>
          </div>
          {"action" in next ? (
            next.action
          ) : (
            <Button variant="primary" asChild>
              <Link href={next.href}>
                {next.cta} <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <Panel title="What this role needs" description={x ? `Extracted ${formatDate(x.extracted_at)}` : undefined}>
          {x ? (
            <div className="flex flex-col gap-5">
              <SkillList title="Must-have skills" items={x.must_have_skills} tone="accent" />
              <SkillList title="Nice to have" items={x.nice_to_have_skills} />
              <SkillList title="Tools and technologies" items={x.tools_technologies} />
              <SkillList title="Topics the tests will cover" items={x.recommended_test_topics} />
              {x.responsibilities.length > 0 && (
                <div>
                  <h3 className="text-sm text-ink-muted">Responsibilities</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-ink marker:text-ink-faint">
                    {x.responsibilities.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-base text-ink-muted">
              {s.busy ? "Skills appear here as soon as the analysis finishes." : "Not analysed yet. Skills, tools and test topics appear here after analysis."}
            </p>
          )}
        </Panel>
        {jd.raw_text ? (
          <JdTextPanel jdId={id} text={jd.raw_text} hasSkills={!!x} />
        ) : (
          <Panel title="Job description">
            <p className="text-base text-ink-muted">{s.busy ? "The text appears here once it's ready." : "No text was extracted from this file."}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
