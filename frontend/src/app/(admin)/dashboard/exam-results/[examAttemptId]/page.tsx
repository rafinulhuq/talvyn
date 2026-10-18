import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/api/serverFetch";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ExamReportView } from "@/components/admin/ExamReportView";
import type { ExamAttemptReportResponse } from "@/types/exam";

interface Props {
  params: Promise<{ examAttemptId: string }>;
}

export const metadata: Metadata = { title: "Exam Report" };

export default async function ExamReportPage({ params }: Props) {
  const { examAttemptId } = await params;

  const report = await serverFetch<ExamAttemptReportResponse>(
    `/api/v1/exam-admin/attempts/${examAttemptId}/report`,
    { revalidate: 0 }
  );

  if (!report) notFound();

  return (
    <div className="w-full">
      <PageHeader
        title="Exam Report"
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Job Descriptions", href: "/dashboard/jds" },
              {
                label: "Question Bank",
                href: `/dashboard/jds/${report.jd_id}/question-bank`,
              },
              {
                label: "Candidates",
                href: `/dashboard/jds/${report.jd_id}/question-bank/candidates`,
              },
              { label: "Report" },
            ]}
          />
        }
      />

      <ExamReportView initialReport={report} />
    </div>
  );
}
