import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, FileText, ChevronRight, Plus, Trophy } from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { JdStatusBadge } from "@/components/admin/JdStatusBadge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import type { JobDescriptionListResponse } from "@/types/jd";

export const metadata: Metadata = { title: "Results by Job Description" };

// Always fetch fresh — results appear as candidates submit assessments.
export const revalidate = 0;

async function getJds(): Promise<JobDescriptionListResponse | null> {
  return serverFetch<JobDescriptionListResponse>("/api/v1/jd/?page=1&page_size=50");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ResultsByJdPage() {
  const data = await getJds();

  return (
    <div className="w-full">
      <PageHeader
        title="Results by Job Description"
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Results", href: "/dashboard/results" },
              { label: "By Job Description" },
            ]}
          />
        }
        subtitle="Select a job description to view candidate results and evaluations."
      />

      {(!data || data.items.length === 0) && (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No results yet"
          description="Upload a job description and invite candidates to see results."
          action={
            <Link href="/dashboard/jds/upload">
              <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Upload JD
              </Button>
            </Link>
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <p className="mb-3 text-xs text-white/70">
            Tip: Click a JD to see candidates, then use the{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-[#F2D74E]">
              <Trophy className="h-3 w-3" /> Leaderboard
            </span>{" "}
            button to rank candidates.
          </p>
          <div className="stagger flex flex-col gap-2 rounded-2xl bg-transparent">
            {data.items.map((jd) => (
              <div key={jd.id} className="flex items-center gap-4 rounded-xl border border-white/8 bg-[#121317] px-5 py-4 transition-colors hover:border-white/16 hover:bg-[#181A1F]">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#181A1F] border border-white/5 text-[#F2D74E]">
                  <FileText className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {jd.job_title ?? jd.original_filename}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {jd.seniority_level && (
                      <span className="text-xs text-white/80">
                        {jd.seniority_level}
                      </span>
                    )}
                    <span className="text-xs text-white/60">
                      {formatDate(jd.created_at)}
                    </span>
                  </div>
                </div>

                <JdStatusBadge status={jd.parse_status} />

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/dashboard/results/leaderboard/${jd.id}`}
                    className="flex items-center gap-1 rounded-lg border border-[#F2D74E]/30 bg-[#F2D74E]/10 px-2.5 py-1.5 text-xs font-semibold text-[#F2D74E] hover:bg-[#F2D74E] hover:text-[#1A1600] transition-colors"
                    aria-label={`Open leaderboard for ${jd.job_title ?? jd.original_filename}`}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Leaderboard</span>
                  </Link>
                  <Link
                    href={`/dashboard/results/jd/${jd.id}`}
                    className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white transition-colors"
                  >
                    <span>Candidates</span>
                    <ChevronRight className="h-4 w-4 text-white/60" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
