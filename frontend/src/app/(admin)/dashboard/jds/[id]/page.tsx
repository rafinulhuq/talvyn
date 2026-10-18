import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FileText, ClipboardList, Users, ArrowRight, BrainCircuit, Database } from "lucide-react";
import { serverFetch } from "@/lib/api/serverFetch";
import { JdStatusBadge } from "@/components/admin/JdStatusBadge";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { Stepper } from "@/components/ui/Stepper";
import { SkillsPanel } from "@/components/admin/SkillsPanel";
import { AnalyzeJdButton } from "@/components/admin/AnalyzeJdButton";
import { ExtractedTextPanel } from "@/components/admin/ExtractedTextPanel";
import { RegenerateJdButton } from "@/components/admin/RegenerateJdButton";
import { buildJdSteps } from "@/lib/jdWorkflow";
import type { JobDescription } from "@/types/jd";
import type { TestSummary } from "@/types/test";
import type { InvitationListResponse } from "@/types/invitation";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * React cache() deduplicates identical calls within a single render pass.
 * Both generateMetadata() and JdDetailPage() call getJd(id) — without cache()
 * that would be 2 backend requests per page load (one from each function).
 * With cache(), React executes the fetch exactly once and reuses the result.
 *
 * We always include raw_text so the single request satisfies both callers.
 *
 * cache: "no-store" — never cache this fetch in Next.js's Data Cache.
 * This is intentional: the JD detail page is actively edited (analyze, generate
 * tests) and AnalyzeJdButton calls router.refresh() after extraction completes.
 * router.refresh() only clears the Router Cache (client-side navigation cache),
 * NOT the Data Cache (server-side fetch cache). If we used revalidate: 30, the
 * server would continue serving stale pre-analysis data for up to 30 seconds
 * even after router.refresh(). With no-store, every server render fetches fresh.
 */
const getJd = cache(async (id: string): Promise<JobDescription | null> => {
  return serverFetch<JobDescription>(
    `/api/v1/jd/${id}?include_raw_text=true`,
    { cache: "no-store" }
  );
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const jd = await getJd(id); // uses cached result — no extra HTTP request
  if (!jd) return { title: "Job Description" };
  return {
    title: jd.extracted_data?.job_title ?? jd.original_filename,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type JdStatusVariant = "pending" | "failed" | "needsAnalysis" | "none";

function jdStatusVariant(isPending: boolean, isFailed: boolean, isParsed: boolean, hasExtracted: boolean): JdStatusVariant {
  if (isPending) return "pending";
  if (isFailed) return "failed";
  if (isParsed && !hasExtracted) return "needsAnalysis";
  return "none";
}

function JdStatusMessage({ status }: { status: JdStatusVariant }) {
  if (status === "pending") {
    return (
      <StatusBanner
        variant="info"
        pulse
        title="Extracting text from your document…"
        description="Refresh this page in a few seconds to see the result."
        className="mb-6"
      />
    );
  }

  if (status === "failed") {
    return (
      <StatusBanner
        variant="danger"
        title="Text extraction failed"
        description="The file may be a scanned image, password-protected, or corrupt. Please re-upload a different version of this file."
        className="mb-6"
      />
    );
  }

  if (status === "needsAnalysis") {
    return (
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-5 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs dark:bg-indigo-500">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
            Text Extraction Complete — Ready For AI Analysis
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Click <strong>Analyze JD</strong> to extract skills, seniority level, and recommended test topics.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function JdExtractedSkillsSection({ extracted }: { extracted: NonNullable<JobDescription["extracted_data"]> }) {
  return (
    <section className="mb-6">
      <SectionHeader
        title="Extracted Skills & Structure"
        actions={
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
              <BrainCircuit className="h-3 w-3" />
              AI extracted
            </span>
            <p className="font-medium text-slate-500">{formatDate(extracted.extracted_at)}</p>
          </div>
        }
      />
      <SkillsPanel data={extracted} />
    </section>
  );
}

function JdRawTextSection({ jd }: { jd: JobDescription }) {
  return (
    <section className="mb-6 space-y-3">
      {jd.source === "GENERATED" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Generated from brief — review and edit, or regenerate.
          </p>
          <RegenerateJdButton jdId={jd.id} />
        </div>
      )}
      <ExtractedTextPanel text={jd.raw_text!} jdId={jd.id} />
    </section>
  );
}

function JdNextStepActions({ jdId }: { jdId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Tests */}
      <Link
        href={`/dashboard/jds/${jdId}/tests`}
        className="group flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-950/70 dark:text-indigo-400">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Assessment Tests
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Generate or review the 3 timed tests
          </p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
      </Link>

      {/* Question Bank */}
      <Link
        href={`/dashboard/jds/${jdId}/question-bank`}
        className="group flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-950/70 dark:text-indigo-400">
          <Database className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Question Bank
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Reusable 3-section bank, shared across candidates
          </p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
      </Link>

      {/* Candidates */}
      <Link
        href={`/dashboard/jds/${jdId}/candidates`}
        className="group flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/60 sm:col-span-2"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-950/70 dark:text-indigo-400">
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Candidates
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Invite candidates and track status
          </p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
      </Link>
    </div>
  );
}

export default async function JdDetailPage({ params }: Props) {
  const { id } = await params;
  const jd = await getJd(id); // cache() → same response as generateMetadata, no second request
  if (!jd) notFound();

  const extracted = jd.extracted_data;
  const isParsed = jd.parse_status === "DONE";
  const isFailed = jd.parse_status === "FAILED";
  const isPending =
    jd.parse_status === "PENDING" || jd.parse_status === "PROCESSING";

  // Counts for the workflow stepper — reuse existing endpoints already used
  // elsewhere (tests/page.tsx, invitations list), no new backend routes.
  const [tests, invitations] = await Promise.all([
    serverFetch<TestSummary[]>(`/api/v1/tests/jd/${id}`),
    serverFetch<InvitationListResponse>(
      `/api/v1/invitations/jd/${id}?page=1&page_size=1`
    ),
  ]);
  const testCount = tests?.length ?? 0;
  const approvedCount = tests?.filter((t) => t.status === "APPROVED").length ?? 0;
  const invitationCount = invitations?.total ?? 0;

  const jdTitle = extracted?.job_title ?? jd.original_filename;

  return (
    <div className="w-full">
      <PageHeader
        title={jdTitle}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Job Descriptions", href: "/dashboard/jds" },
              { label: jdTitle },
            ]}
          />
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <JdStatusBadge status={jd.parse_status} />
            {extracted?.seniority_level && (
              <Badge variant="slate">{extracted.seniority_level}</Badge>
            )}
            <span className="text-xs uppercase text-slate-400">
              {jd.file_type ?? "Generated"}
            </span>
            <span className="text-xs text-slate-400">
              Uploaded {formatDate(jd.created_at)}
            </span>
          </span>
        }
        actions={
          (isParsed || extracted) && (
            <AnalyzeJdButton
              jdId={jd.id}
              parseStatus={jd.parse_status}
              hasExistingData={extracted !== null}
            />
          )
        }
      />

      {/* ── Workflow stepper ──────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <Stepper steps={buildJdSteps(jd, testCount, approvedCount, invitationCount)} />
      </div>

      <JdStatusMessage status={jdStatusVariant(isPending, isFailed, isParsed, extracted != null)} />

      {extracted && <JdExtractedSkillsSection extracted={extracted} />}

      {isParsed && jd.raw_text && <JdRawTextSection jd={jd} />}

      {extracted && <JdNextStepActions jdId={jd.id} />}
    </div>
  );
}
