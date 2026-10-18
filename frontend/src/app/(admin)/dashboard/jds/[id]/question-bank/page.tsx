import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { QuestionBankPanel } from "@/components/admin/QuestionBankPanel";
import type { JobDescription } from "@/types/jd";
import type { BankStatusResponse } from "@/types/exam";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Question Bank" };

export default async function QuestionBankPage({ params }: Props) {
  const { id } = await params;

  const [jd, bankStatus] = await Promise.all([
    serverFetch<JobDescription>(`/api/v1/jd/${id}`, { revalidate: 0 }),
    serverFetch<BankStatusResponse>(`/api/v1/jd/${id}/question-bank/status`, { revalidate: 0 }),
  ]);

  if (!jd) notFound();

  const jdTitle = jd.extracted_data?.job_title ?? jd.original_filename;
  const status: BankStatusResponse =
    bankStatus ?? {
      exists: false,
      bank_id: null,
      status: null,
      ready: false,
      below_recommended: false,
      is_approved: false,
      sections: {},
    };

  return (
    <div className="w-full">
      <PageHeader
        title="Question Bank"
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Job Descriptions", href: "/dashboard/jds" },
              { label: jdTitle, href: `/dashboard/jds/${id}` },
              { label: "Question Bank" },
            ]}
          />
        }
        subtitle="Generate and review the reusable Reasoning / Practical / Technical question bank for this job."
        actions={
          <Link
            href={`/dashboard/jds/${id}/question-bank/candidates`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Users className="h-4 w-4 text-slate-500" />
            <span>View candidates</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        }
      />

      <QuestionBankPanel jdId={id} initialStatus={status} />
    </div>
  );
}
