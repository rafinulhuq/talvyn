import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TestPreview } from "@/components/tests/test-preview";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { plural, testTypeLabel } from "@/lib/domain/test";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { Test } from "@/types/test";

export const metadata: Metadata = { title: "Preview" };
const SAFE = /^[A-Za-z0-9_-]{1,128}$/;

export default async function PreviewPage({ params }: { params: Promise<{ id: string; testId: string }> }) {
  const { id, testId } = await params;
  if (!SAFE.test(id) || !SAFE.test(testId)) notFound();
  const res = await serverGet<Test>(`/api/v1/tests/${testId}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(res.status)} />;
  }
  const test = res.data;
  if (test.jd_id !== id) notFound();
  const editHref = `/dashboard/jds/${id}/tests/${testId}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: "Tests", href: `/dashboard/jds/${id}/tests` },
          { label: testTypeLabel(test.test_type), href: editHref },
          { label: "Preview" },
        ]}
        title={test.title}
        description={`${plural(test.questions.length, "question")} in ${test.duration_minutes} minutes. ${test.description ?? ""}`.trim()}
        actions={
          <Button variant="secondary" asChild>
            <Link href={editHref}>
              <Pencil aria-hidden className="size-4" /> Back to editing
            </Link>
          </Button>
        }
        className="pb-0"
      />
      <TestPreview test={test} />
    </div>
  );
}
