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
          <p className="mb-3 text-xs text-slate-400">
            Tip: Click a JD to see candidates, then use the{" "}
            <span className="inline-flex items-center gap-1 font-medium text-amber-600">
              <Trophy className="h-3 w-3" /> Leaderboard
            </span>{" "}
            button to rank candidates.
          </p>
          <div className="stagger flex flex-col gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
            {data.items.map((jd) => (
              <div key={jd.id} className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                  <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                    {jd.job_title ?? jd.original_filename}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {jd.seniority_level && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {jd.seniority_level}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {formatDate(jd.created_at)}
                    </span>
                  </div>
                </div>

                <JdStatusBadge status={jd.parse_status} />

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/dashboard/results/leaderboard/${jd.id}`}
                    className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                    aria-label={`Open leaderboard for ${jd.job_title ?? jd.original_filename}`}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Leaderboard</span>
                  </Link>
                  <Link
                    href={`/dashboard/results/jd/${jd.id}`}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    <span>Candidates</span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
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
