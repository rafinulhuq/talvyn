import type { Metadata } from "next";
import { FileSearch } from "lucide-react";
import { AtsCheckerClient } from "@/components/admin/AtsCheckerClient";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "ATS Checker" };

export default function AtsCheckerPage() {
  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="ATS Checker"
        subtitle="Score a resume for how well an applicant tracking system can read it."
        actions={
          <div className="hidden rounded-xl bg-white p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:block">
            <FileSearch className="h-5 w-5" />
          </div>
        }
      />
      <AtsCheckerClient />
    </div>
  );
}
