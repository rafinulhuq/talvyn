import { ClipboardList, ScanSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JdSubnav } from "@/components/jd/jd-subnav";
import { GenerateTestsButton, GenerationProgress } from "@/components/tests/test-generation";
import { TestsTable } from "@/components/tests/tests-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { jdTitle } from "@/lib/domain/jd";
import { mixFrom, plural } from "@/lib/domain/test";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { JdStatus, JobDescription } from "@/types/jd";
import type { TestSummary } from "@/types/test";

export const metadata: Metadata = { title: "Tests" };

export default async function TestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();

  const [jdRes, statusRes, testsRes] = await Promise.all([
    serverGet<JobDescription>(`/api/v1/jd/${id}`),
    serverGet<JdStatus>(`/api/v1/jd/${id}/status`),
    serverGet<TestSummary[]>(`/api/v1/tests/jd/${id}`),
  ]);
  if (!jdRes.ok) {
    if (jdRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(jdRes.status)} />;
  }
  const jd = jdRes.data;
  const x = jd.extracted_data;
  const title = jdTitle({ job_title: x?.job_title ?? null, original_filename: jd.original_filename });
  const status: JdStatus = statusRes.ok
    ? statusRes.data
    : { id, parse_status: jd.parse_status, generation_status: jd.generation_status, has_extracted_data: !!x, has_tests: false, error_message: null };
  // Archived tests were replaced by a regeneration; they stay only for past candidates' results.
  const all = testsRes.ok ? testsRes.data : [];
  const tests = all.filter((t) => t.status !== "ARCHIVED");
  const archived = all.length - tests.length;
  const approved = tests.filter((t) => t.status === "APPROVED").length;
  const busy = ["DRAFTING", "EXTRACTING", "GENERATING"].includes(status.generation_status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Job descriptions", href: "/dashboard/jds" }, { label: title, href: `/dashboard/jds/${id}` }, { label: "Tests" }]}
        title={title}
        description={
          tests.length
            ? `${plural(tests.length, "test")}, ${approved} approved. Candidates can only be invited to approved tests.`
            : "The assessment candidates take for this role."
        }
        actions={
          x && (
            <GenerateTestsButton jdId={id} hasTests={tests.length > 0} approvedCount={approved} suggested={mixFrom(x.difficulty_distribution)} disabled={busy} />
          )
        }
        className="pb-0"
      />
      <JdSubnav jdId={id} />

      <GenerationProgress jdId={id} status={status} />

      {!testsRes.ok ? (
        <ErrorState message={loadErrorMessage(testsRes.status)} />
      ) : !x ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            icon={ScanSearch}
            title="Analyse the skills first"
            description="Tests are written from the skills, tools and seniority found in the job description."
            action={
              <Button variant="primary" size="sm" asChild>
                <Link href={`/dashboard/jds/${id}`}>Go to the overview</Link>
              </Button>
            }
          />
        </div>
      ) : tests.length === 0 && status.generation_status !== "GENERATING" ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            icon={ClipboardList}
            title="No tests yet"
            description="Generate three tests from this role's skills: technical, reasoning and problem solving. You review and approve each before inviting anyone."
          />
        </div>
      ) : tests.length > 0 ? (
        <TestsTable jdId={id} tests={tests} />
      ) : null}

      {archived > 0 && (
        <p className="text-sm text-ink-muted">
          {plural(archived, "archived test")} from earlier generations {archived === 1 ? "is" : "are"} kept for past candidates&apos; results.
        </p>
      )}
    </div>
  );
}
