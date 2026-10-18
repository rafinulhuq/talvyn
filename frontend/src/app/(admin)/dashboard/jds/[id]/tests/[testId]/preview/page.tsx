import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/api/serverFetch";
import { TestPreviewPanel } from "@/components/admin/TestPreviewPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import type { Test } from "@/types/test";

interface Props {
  params: Promise<{ id: string; testId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { testId } = await params;
  const test = await serverFetch<Test>(`/api/v1/tests/${testId}`);
  return { title: test ? `Preview: ${test.title}` : "Test Preview" };
}

export default async function TestPreviewPage({ params }: Props) {
  const { id: jdId, testId } = await params;
  // No cache — admin needs to see the latest question edits immediately
  const test = await serverFetch<Test>(`/api/v1/tests/${testId}`, { revalidate: 0 });
  if (!test) notFound();

  const totalMarks = test.questions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <div className="w-full">
      <PageHeader
        title={test.title}
        subtitle={`${test.duration_minutes} min · ${test.questions.length} question${test.questions.length !== 1 ? "s" : ""} · ${totalMarks} marks total`}
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Test", href: `/dashboard/jds/${jdId}/tests/${testId}` }, { label: "Preview" }]}
          />
        }
        className="mb-6"
      />

      <TestPreviewPanel test={test} />
    </div>
  );
}
