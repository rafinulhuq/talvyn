import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { QuestionList } from "@/components/tests/question-list";
import { TestActions } from "@/components/tests/test-actions";
import { TestSettings } from "@/components/tests/test-settings";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { jdTitle } from "@/lib/domain/jd";
import { plural, testStatusBadge, testTypeLabel } from "@/lib/domain/test";
import { formatRelative } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { JobDescription } from "@/types/jd";
import type { Test } from "@/types/test";

type Props = { params: Promise<{ id: string; testId: string }> };
const SAFE = /^[A-Za-z0-9_-]{1,128}$/;

const getTest = cache((id: string) => serverGet<Test>(`/api/v1/tests/${id}`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { testId } = await params;
  if (!SAFE.test(testId)) return { title: "Test" };
  const res = await getTest(testId);
  return { title: res.ok ? res.data.title : "Test" };
}

export default async function TestPage({ params }: Props) {
  const { id, testId } = await params;
  if (!SAFE.test(id) || !SAFE.test(testId)) notFound();
  const [testRes, jdRes] = await Promise.all([getTest(testId), serverGet<JobDescription>(`/api/v1/jd/${id}`)]);
  if (!testRes.ok) {
    if (testRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(testRes.status)} />;
  }
  const test = testRes.data;
  if (test.jd_id !== id) notFound();
  const role = jdRes.ok ? jdTitle({ job_title: jdRes.data.extracted_data?.job_title ?? null, original_filename: jdRes.data.original_filename }) : "Job description";
  const b = testStatusBadge(test.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: "Job descriptions", href: "/dashboard/jds" },
          { label: role, href: `/dashboard/jds/${id}` },
          { label: "Tests", href: `/dashboard/jds/${id}/tests` },
          { label: testTypeLabel(test.test_type) },
        ]}
        title={test.title}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Badge tone={b.tone} dot>
              {b.label}
            </Badge>
            <span>{testTypeLabel(test.test_type)}</span>
            <span>{plural(test.questions.length, "question")}</span>
            <span>{test.duration_minutes} min</span>
            <span>{test.passing_marks != null ? `Pass at ${test.passing_marks} of ${test.total_marks}` : `${test.total_marks} marks`}</span>
            <span>Updated {formatRelative(test.updated_at)}</span>
          </span>
        }
        actions={<TestActions test={test} />}
        className="pb-0"
      />

      {test.status === "ARCHIVED" && (
        <Alert title="Archived">This test was replaced when the tests were regenerated. It&apos;s kept so past candidates&apos; results still make sense.</Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <QuestionList testId={test.id} questions={test.questions} />
        <div className="lg:sticky lg:top-6">
          <TestSettings test={test} />
        </div>
      </div>
    </div>
  );
}
