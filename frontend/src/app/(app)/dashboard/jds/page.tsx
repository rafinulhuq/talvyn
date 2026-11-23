import { FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JdTable } from "@/components/jd/jd-table";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { JobDescriptionListItem, Paginated } from "@/types/jd";

export const metadata: Metadata = { title: "Job descriptions" };

export default async function JdListPage() {
  const res = await serverGet<Paginated<JobDescriptionListItem>>("/api/v1/jd/?page=1&page_size=100");
  return (
    <>
      <PageHeader
        title="Job descriptions"
        description="Each role gets its own generated assessment and candidate list."
        actions={
          <Button variant="primary" asChild>
            <Link href="/dashboard/jds/upload">
              <FileUp aria-hidden className="size-4" />
              New job description
            </Link>
          </Button>
        }
      />
      {res.ok ? <JdTable items={res.data.items} total={res.data.total} /> : <ErrorState message={loadErrorMessage(res.status)} />}
    </>
  );
}
