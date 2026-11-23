import type { Metadata } from "next";
import { AiChecker } from "@/components/tools/ai-checker";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "AI writing check" };

export default function AiCheckerPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="AI writing check" description="Estimates how much of a text reads like AI-generated writing. Use it to decide what to ask about, not to decide on a person." className="pb-0" />
      <AiChecker />
    </div>
  );
}
