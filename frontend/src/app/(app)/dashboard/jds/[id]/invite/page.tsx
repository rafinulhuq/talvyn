import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InviteBulk } from "@/components/invite/invite-bulk";
import { InviteSingle } from "@/components/invite/invite-single";
import { InviteTabs } from "@/components/invite/invite-tabs";
import { PublicLinkPanel } from "@/components/invite/public-link-panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { jdTitle } from "@/lib/domain/jd";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { PublicLink, PublicLinkAnalytics } from "@/types/invitation";
import type { JobDescription } from "@/types/jd";
import type { TestSummary } from "@/types/test";

export const metadata: Metadata = { title: "Invite candidates" };

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const [jdRes, testsRes, linksRes] = await Promise.all([
    serverGet<JobDescription>(`/api/v1/jd/${id}`),
    serverGet<TestSummary[]>(`/api/v1/tests/jd/${id}`),
    serverGet<{ items: PublicLink[] }>(`/api/v1/public-links/jd/${id}`),
  ]);
  if (!jdRes.ok) {
    if (jdRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(jdRes.status)} />;
  }
  const jd = jdRes.data;
  const title = jdTitle({ job_title: jd.extracted_data?.job_title ?? null, original_filename: jd.original_filename });
  const approved = (testsRes.ok ? testsRes.data : []).filter((t) => t.status === "APPROVED");
  const links = linksRes.ok ? linksRes.data.items : [];
  // Show the active link if there is one, otherwise the newest.
  const link = links.find((l) => l.status === "ACTIVE") ?? links[0] ?? null;
  const analyticsRes = link ? await serverGet<PublicLinkAnalytics>(`/api/v1/public-links/${link.id}/analytics`) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: "Job descriptions", href: "/dashboard/jds" },
          { label: title, href: `/dashboard/jds/${id}` },
          { label: "Candidates", href: `/dashboard/jds/${id}/candidates` },
          { label: "Invite" },
        ]}
        title="Invite candidates"
        description={`For ${title}.`}
        className="pb-0"
      />
      {approved.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            icon={ClipboardCheck}
            title="Approve a test first"
            description="Candidates can only be invited to approved tests. Review the generated tests and approve the ones you want to use."
            action={
              <Button variant="primary" size="sm" asChild>
                <Link href={`/dashboard/jds/${id}/tests`}>Review tests</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <Suspense>
          <InviteTabs
            panels={{
              one: <InviteSingle jdId={id} tests={approved} />,
              list: <InviteBulk jdId={id} tests={approved} />,
              link: <PublicLinkPanel jdId={id} link={link} analytics={analyticsRes?.ok ? analyticsRes.data : null} />,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
