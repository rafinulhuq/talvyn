import type { Metadata } from "next";
import { BrainCircuit } from "lucide-react";
import { AiCheckerClient } from "@/components/admin/AiCheckerClient";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "AI Checker" };

export default function AiCheckerPage() {
  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="AI Checker"
        subtitle="Upload or paste a document to estimate AI-likeness."
        actions={
          <div className="hidden rounded-xl bg-white p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:block">
            <BrainCircuit className="h-5 w-5" />
          </div>
        }
      />
      <AiCheckerClient />
    </div>
  );
}
