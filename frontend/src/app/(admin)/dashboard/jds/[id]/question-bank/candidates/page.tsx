import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { JobDescription } from "@/types/jd";
import { EXAM_STATUS_LABELS, type ExamCandidateListResponse } from "@/types/exam";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Exam Candidates" };

const STATUS_BADGE: Record<string, "yellow" | "blue" | "green" | "red" | "slate"> = {
  ASSIGNED: "slate",
  STARTED: "blue",
  SECTION_SUBMITTED: "blue",
  SUBMITTED: "yellow",
  EVALUATING: "blue",
  EVALUATED: "green",
  FAILED: "red",
};

export default async function ExamCandidatesPage({ params }: Props) {
  const { id } = await params;

  const [jd, candidates] = await Promise.all([
    serverFetch<JobDescription>(`/api/v1/jd/${id}`, { revalidate: 0 }),
    serverFetch<ExamCandidateListResponse>(`/api/v1/exam-admin/jd/${id}/candidates`, { revalidate: 0 }),
  ]);

  if (!jd) notFound();
  const jdTitle = jd.extracted_data?.job_title ?? jd.original_filename;
  const items = candidates?.items ?? [];

  return (
    <div className="w-full">
      <PageHeader
        title="Exam Candidates"
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Job Descriptions", href: "/dashboard/jds" },
              { label: jdTitle, href: `/dashboard/jds/${id}` },
              { label: "Question Bank", href: `/dashboard/jds/${id}/question-bank` },
              { label: "Candidates" },
            ]}
          />
        }
        subtitle="Every candidate's sectioned-exam attempt for this job."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No candidates yet"
          description="Invite a candidate to this job once the question bank is reviewed and approved."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">AI-risk</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.exam_attempt_id} className="border-b border-slate-200/70 last:border-0 dark:border-slate-700/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{c.candidate_name}</p>
                    <p className="text-xs text-slate-500">{c.candidate_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[c.status] ?? "slate"}>
                      {EXAM_STATUS_LABELS[c.status] ?? c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.total_score !== null ? `${c.total_score.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.ai_risk_score !== null ? `${c.ai_risk_score.toFixed(0)}/100` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/exam-results/${c.exam_attempt_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                    >
                      View report <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
