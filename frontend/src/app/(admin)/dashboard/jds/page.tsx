import type { Metadata } from "next";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { JdListRow } from "@/components/admin/JdListRow";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { JobDescriptionListResponse } from "@/types/jd";

export const metadata: Metadata = { title: "Job Descriptions" };

// Always fetch fresh — generation_status changes during test generation.
export const revalidate = 0;

async function getJds(): Promise<JobDescriptionListResponse | null> {
  return serverFetch<JobDescriptionListResponse>(
    "/api/v1/jd/?page=1&page_size=50"
    // revalidate inherited from segment-level `export const revalidate = 30`
  );
}

export default async function JdsPage() {
  const data = await getJds();

  return (
    <div className="w-full">
      <PageHeader
        title="Job Descriptions"
        subtitle={
          data ? `${data.total} job description${data.total !== 1 ? "s" : ""}` : "—"
        }
        actions={
          <Link href="/dashboard/jds/upload">
            <Button leftIcon={<Plus className="h-4 w-4" />}>
              Upload JD
            </Button>
          </Link>
        }
      />

      {/* Empty state */}
      {(!data || data.items.length === 0) && (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No job descriptions yet"
          description="Upload a PDF or DOCX to generate assessments"
          action={
            <Link href="/dashboard/jds/upload">
              <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Upload your first JD
              </Button>
            </Link>
          }
        />
      )}

      {/* List */}
      {data && data.items.length > 0 && (
        <div className="stagger flex flex-col gap-3 font-mono">
          {data.items.map((jd) => (
            <JdListRow key={jd.id} jd={jd} />
          ))}
        </div>
      )}
    </div>
  );
}
