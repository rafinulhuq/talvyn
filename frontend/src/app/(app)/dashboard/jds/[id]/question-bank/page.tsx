import { ScanSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JdSubnav } from "@/components/jd/jd-subnav";
import { BankPanel } from "@/components/tests/bank-panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { jdTitle } from "@/lib/domain/jd";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { JobDescription } from "@/types/jd";
import type { BankStatus, ExamTemplate } from "@/types/test";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const [jdRes, bankRes, tplRes] = await Promise.all([
    serverGet<JobDescription>(`/api/v1/jd/${id}`),
    serverGet<BankStatus>(`/api/v1/jd/${id}/question-bank/status`),
    // Templates are optional extras for the size picker; a failure here just hides them.
    serverGet<{ items: ExamTemplate[] }>(`/api/v1/templates/?include_archived=false`),
  ]);
  if (!jdRes.ok) {
    if (jdRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(jdRes.status)} />;
  }
  const jd = jdRes.data;
  const x = jd.extracted_data;
  const title = jdTitle({ job_title: x?.job_title ?? null, original_filename: jd.original_filename });
  const templates = tplRes.ok ? tplRes.data.items.filter((t) => t.status === "ACTIVE") : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Job descriptions", href: "/dashboard/jds" }, { label: title, href: `/dashboard/jds/${id}` }, { label: "Question bank" }]}
        title={title}
        description="A reusable pool of reasoning, practical and technical questions. Each candidate gets a different selection."
        className="pb-0"
      />
      <JdSubnav jdId={id} />

      {!x ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            icon={ScanSearch}
            title="Analyse the skills first"
            description="The bank's questions are written from the skills found in the job description."
            action={
              <Button variant="primary" size="sm" asChild>
                <Link href={`/dashboard/jds/${id}`}>Go to the overview</Link>
              </Button>
            }
          />
        </div>
      ) : !bankRes.ok ? (
        <ErrorState message={loadErrorMessage(bankRes.status)} />
      ) : (
        <BankPanel jdId={id} initial={bankRes.data} templates={templates} />
      )}
    </div>
  );
}
