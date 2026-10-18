import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { TestsGridWithBulkActions } from "@/components/admin/TestsGridWithBulkActions";
import { GenerateTestsButton } from "@/components/admin/GenerateTestsButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { Stepper } from "@/components/ui/Stepper";
import { buildJdSteps } from "@/lib/jdWorkflow";
import type { JobDescription } from "@/types/jd";
import type { TestSummary } from "@/types/test";
import type { InvitationListResponse } from "@/types/invitation";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Tests" };
}

// Always fetch fresh — test list changes right after generation completes.
export const revalidate = 0;

async function getData(jdId: string) {
  // Fire all requests concurrently — they are independent
  const [jd, tests, invitations] = await Promise.all([
    serverFetch<JobDescription>(`/api/v1/jd/${jdId}`),
    serverFetch<TestSummary[]>(`/api/v1/tests/jd/${jdId}`),
    serverFetch<InvitationListResponse>(
      `/api/v1/invitations/jd/${jdId}?page=1&page_size=1`
    ),
  ]);
  return {
    jd,
    tests: tests ?? [],
    invitationCount: invitations?.total ?? 0,
  };
}

export default async function TestsListPage({ params }: Props) {
  const { id: jdId } = await params;
  const { jd, tests, invitationCount } = await getData(jdId);

  if (!jd) notFound();

  const hasExtractedData = jd.extracted_data !== null;
  const hasTests = tests.length > 0;
  const approvedCount = tests.filter((t) => t.status === "APPROVED").length;

  const jdTitle = jd.extracted_data?.job_title ?? jd.original_filename;

  return (
    <div className="w-full">
      <PageHeader
        title="Assessment Tests"
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Job Descriptions", href: "/dashboard/jds" },
              { label: jdTitle, href: `/dashboard/jds/${jdId}` },
              { label: "Tests" },
            ]}
          />
        }
        subtitle={
          hasTests
            ? `${tests.length} tests · ${approvedCount} approved`
            : "No tests generated yet"
        }
        actions={
          <GenerateTestsButton
            jdId={jdId}
            jdTitle={jdTitle}
            hasExtractedData={hasExtractedData}
            hasExistingTests={hasTests}
            initialDifficultyDistribution={
              jd.extracted_data?.difficulty_distribution ?? null
            }
          />
        }
      />

      {/* ── Workflow stepper ──────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <Stepper steps={buildJdSteps(jd, tests.length, approvedCount, invitationCount)} />
      </div>

      {/* No skills extracted warning */}
      {!hasExtractedData && (
        <StatusBanner
          variant="warning"
          title="Skills not yet extracted"
          description='Go back to the JD and click "Analyze JD" before generating tests.'
          className="mb-5 sm:mb-6"
        />
      )}

      {/* Empty state */}
      {hasTests === false && hasExtractedData && (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No tests yet"
          description='Click "Generate Tests" to create 3 AI-powered assessments.'
        />
      )}

      {/* Tests grid */}
      {hasTests && <TestsGridWithBulkActions tests={tests} jdId={jdId} />}

      {/* Approval reminder */}
      {hasTests && approvedCount < tests.length && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Approve tests before sending them to candidates.
        </p>
      )}
    </div>
  );
}
