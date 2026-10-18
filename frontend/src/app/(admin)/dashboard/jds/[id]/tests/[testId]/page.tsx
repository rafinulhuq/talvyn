import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { serverFetch } from "@/lib/api/serverFetch";
import { TestEditorPanel } from "@/components/admin/TestEditorPanel";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import type { Test } from "@/types/test";
import { TEST_TYPE_LABELS } from "@/types/test";

interface Props {
  params: Promise<{ id: string; testId: string }>;
}

// Always fetch fresh — test status/question edits change in-place and admins
// expect the detail page to agree immediately with the tests list.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// cache() deduplicates the generateMetadata + page component fetch into one
// request within a single render pass, without persisting stale test status.
const getTest = cache(async (testId: string): Promise<Test | null> => {
  return serverFetch<Test>(`/api/v1/tests/${testId}`, { cache: "no-store" });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { testId } = await params;
  const test = await getTest(testId);
  if (!test) return { title: "Test" };
  return { title: `${TEST_TYPE_LABELS[test.test_type]}` };
}

export default async function TestDetailPage({ params }: Props) {
  const { id: jdId, testId } = await params;
  const test = await getTest(testId); // cache() → reuses generateMetadata result
  if (!test) notFound();

  return (
    <div className="w-full">
      <Breadcrumbs
        items={[{ label: "All Tests", href: `/dashboard/jds/${jdId}/tests` }, { label: TEST_TYPE_LABELS[test.test_type] }]}
        className="mb-6"
      />

      <TestEditorPanel initialTest={test} />
    </div>
  );
}
