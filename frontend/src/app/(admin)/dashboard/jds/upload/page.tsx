import type { Metadata } from "next";
import { JdCreateTabs } from "@/components/admin/JdCreateTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export const metadata: Metadata = { title: "New Job Description" };

export default function UploadJdPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="New Job Description"
        subtitle="Upload a PDF or DOCX, or generate one from a brief. You review and edit it before anything else runs."
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Job Descriptions", href: "/dashboard/jds" }, { label: "New" }]} />
        }
        className="mb-6 sm:mb-8"
      />

      {/* What happens section */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:mb-8">
        <div className="mb-3.5 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Workflow Overview</p>
        </div>
        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {[
            "JD prepared & parsed",
            "Review & edit description",
            "AI skill & topic extraction",
            "3 timed assessments drafted",
            "Invite & evaluate candidates",
          ].map((step, i) => (
            <li key={step} className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs text-slate-700 dark:border-slate-800/60 dark:bg-slate-800/40 dark:text-slate-300">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-400">
                {i + 1}
              </span>
              <span className="font-medium leading-tight">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Upload ⇄ Generate */}
      <JdCreateTabs />
    </div>
  );
}
