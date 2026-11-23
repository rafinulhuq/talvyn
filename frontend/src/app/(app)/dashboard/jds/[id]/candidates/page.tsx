import { UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JdSubnav } from "@/components/jd/jd-subnav";
import { InvitationTable } from "@/components/invite/invitation-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { jdTitle } from "@/lib/domain/jd";
import { plural } from "@/lib/domain/test";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { InvitationPage } from "@/types/invitation";
import type { JobDescription } from "@/types/jd";

export const metadata: Metadata = { title: "Candidates" };
const PAGE_SIZE = 25;

export default async function JdCandidatesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const page = pageParam((await searchParams).page);
  const [jdRes, invRes] = await Promise.all([
    serverGet<JobDescription>(`/api/v1/jd/${id}`),
    serverGet<InvitationPage>(`/api/v1/invitations/jd/${id}?page=${page}&page_size=${PAGE_SIZE}`),
  ]);
  if (!jdRes.ok) {
    if (jdRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(jdRes.status)} />;
  }
  const jd = jdRes.data;
  const title = jdTitle({ job_title: jd.extracted_data?.job_title ?? null, original_filename: jd.original_filename });
  const inv = invRes.ok ? invRes.data : null;
  const invite = (
    <Button variant="primary" asChild>
      <Link href={`/dashboard/jds/${id}/invite`}>
        <UserPlus aria-hidden className="size-4" /> Invite candidates
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Job descriptions", href: "/dashboard/jds" }, { label: title, href: `/dashboard/jds/${id}` }, { label: "Candidates" }]}
        title={title}
        description={inv && inv.total > 0 ? `${plural(inv.total, "invitation")} sent for this role.` : "Everyone invited to this role, and where they are."}
        actions={invite}
        className="pb-0"
      />
      <JdSubnav jdId={id} />
      {!inv ? (
        <ErrorState message={loadErrorMessage(invRes.ok ? 500 : invRes.status)} />
      ) : inv.total === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState icon={Users} title="Nobody invited yet" description="Send private links by email, upload a list, or share one public link." action={invite} />
        </div>
      ) : (
        <>
          <InvitationTable items={inv.items} />
          <Pagination
            page={inv.page}
            pageSize={inv.page_size}
            total={inv.total}
            totalPages={inv.total_pages ?? Math.ceil(inv.total / inv.page_size)}
            href={(p) => `/dashboard/jds/${id}/candidates?page=${p}`}
          />
        </>
      )}
      <p className="text-sm text-ink-muted">
        Candidates taking the sectioned exam from the question bank are listed{" "}
        <Link className="text-accent hover:underline" href={`/dashboard/jds/${id}/question-bank/candidates`}>
          with the question bank
        </Link>
        .
      </p>
    </div>
  );
}
