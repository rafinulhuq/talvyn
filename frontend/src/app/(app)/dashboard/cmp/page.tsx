import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CmpEditor, type CmsDoc } from "@/components/cmp/cmp-editor";
import { DOCS } from "@/lib/cms/docs";
import type { Obj } from "@/components/cmp/json-form";
import { CmpTabs } from "@/components/cmp/cmp-tabs";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { roleAtLeast } from "@/lib/roles";
import { loadErrorMessage, serverGet } from "@/server/api";
import { backendBaseUrl } from "@/server/internal-api";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Website content" };

async function liveCopy(key: string): Promise<Obj | null> {
  if (key === "invitation_email") return null; // not served publicly
  try {
    const res = await fetch(`${backendBaseUrl()}/api/v1/cmp/public/content`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as Record<string, Obj>)[key] ?? null;
  } catch {
    return null;
  }
}

export default async function CmpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAppUser();
  if (!roleAtLeast(me.role, "SUPER_ADMIN")) redirect("/dashboard");
  const raw = (await searchParams).doc;
  const key = typeof raw === "string" && raw in DOCS ? raw : "home";
  const [res, live] = await Promise.all([serverGet<CmsDoc>(`/api/v1/cmp/documents/${key}`), liveCopy(key)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Website content" description="The public homepage, candidate pages and invitation email. Edits stay in a draft until you publish." className="pb-0" />
      <CmpTabs current={key} />
      {res.ok ? <CmpEditor key={key} doc={res.data} live={live} /> : <ErrorState message={loadErrorMessage(res.status)} />}
    </div>
  );
}
