import type { Metadata } from "next";
import { BriefForm } from "@/components/jd/brief-form";
import { UploadForm } from "@/components/jd/upload-form";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "New job description" };

export default function NewJdPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New job description"
        description="Talvyn reads it, extracts the skills that matter, and builds the assessment from them."
        crumbs={[{ label: "Job descriptions", href: "/dashboard/jds" }, { label: "New" }]}
      />
      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload a file</TabsTrigger>
          <TabsTrigger value="brief">Write from a brief</TabsTrigger>
        </TabsList>
        <TabsContent value="upload">
          <UploadForm />
        </TabsContent>
        <TabsContent value="brief">
          <BriefForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
