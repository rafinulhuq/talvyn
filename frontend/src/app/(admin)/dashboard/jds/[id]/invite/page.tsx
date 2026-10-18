import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { InviteModeSwitcher } from "@/components/admin/InviteModeSwitcher";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import type { JobDescription } from "@/types/jd";
import type { TestSummary } from "@/types/test";

export const metadata: Metadata = { title: "Invite Candidate" };

// Always fetch fresh — approval status can change moments before an admin
// lands here, and a stale "approved" list would hide newly-approved tests
// (or worse, offer one that's just been archived).
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

async function getData(jdId: string) {
  // Fire both requests concurrently — they are independent
  const [jd, tests] = await Promise.all([
    serverFetch<JobDescription>(`/api/v1/jd/${jdId}`),
    serverFetch<TestSummary[]>(`/api/v1/tests/jd/${jdId}`),
  ]);

  return {
    jd,
    tests: tests ?? [],
  };
}

export default async function InvitePage({ params }: Props) {
  const { id: jdId } = await params;
  const { jd, tests } = await getData(jdId);
  if (!jd) notFound();

  const approvedTests = tests.filter((t) => t.status === "APPROVED");
  const jdTitle =
    jd.extracted_data?.job_title ?? jd.original_filename;

  return (
    <div className="w-full">
      <PageHeader
        title="Invite Candidate"
        subtitle={
          <>
            Send a one-time magic link to a candidate for{" "}
            <span className="font-medium text-slate-700">{jdTitle}</span>.
          </>
        }
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Candidates", href: `/dashboard/jds/${jdId}/candidates` }, { label: "Invite" }]}
          />
        }
        className="mb-6"
      />

      {/* No approved tests warning */}
      {approvedTests.length === 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/20 bg-warning-light p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-warning-dark">
              No approved tests
            </p>
            <p className="mt-0.5 text-xs text-warning-dark/80">
              You need to approve at least one test before sending invitations.{" "}
              <Link
                href={`/dashboard/jds/${jdId}/tests`}
                className="underline underline-offset-2 hover:no-underline"
              >
                Go to tests →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Invite form — single or bulk CSV */}
      <InviteModeSwitcher
        jdId={jdId}
        approvedTests={approvedTests}
        jdTitle={jdTitle}
      />
    </div>
  );
}
