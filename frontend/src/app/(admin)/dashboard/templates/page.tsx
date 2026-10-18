import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExamTemplatesClient } from "@/components/admin/ExamTemplatesClient";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="Templates"
        subtitle="A reusable question-bank config library, separate from per-JD generation."
        className="mb-8"
      />
      <ExamTemplatesClient />
    </div>
  );
}
