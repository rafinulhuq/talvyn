import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewPostButton } from "@/components/blog/new-post";
import { CmpTabs } from "@/components/cmp/cmp-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { roleAtLeast } from "@/lib/roles";
import { formatRelative } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import { requireAppUser } from "@/server/session";
import { postState, type AdminPostSummary } from "@/types/blog";

export const metadata: Metadata = { title: "Blog posts" };

export default async function BlogAdminPage() {
  const me = await requireAppUser();
  if (!roleAtLeast(me.role, "SUPER_ADMIN")) redirect("/dashboard");
  const res = await serverGet<{ items: AdminPostSummary[]; total: number }>("/api/v1/cmp/blog?limit=100");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Website content" description="The public homepage, candidate pages and invitation email. Edits stay in a draft until you publish." className="pb-0" />
      <CmpTabs current="blog" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-base text-ink-muted">{res.ok ? `${res.data.total} ${res.data.total === 1 ? "post" : "posts"}` : ""}</p>
        <NewPostButton />
      </div>
      {!res.ok ? (
        <ErrorState message={loadErrorMessage(res.status)} />
      ) : res.data.items.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState icon={Newspaper} title="No posts yet" description="Write the first one. It stays a draft until you publish it." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-panel border border-line bg-surface">
          <Table aria-label="Blog posts">
            <THead>
              <tr>
                <TH>Post</TH>
                <TH>Status</TH>
                <TH>Author</TH>
                <TH>Updated</TH>
              </tr>
            </THead>
            <tbody>
              {res.data.items.map((p) => {
                const s = postState(p);
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/dashboard/cmp/blog/${p.id}`} className="font-medium text-ink hover:text-accent">
                        {p.title}
                      </Link>
                      <span className="block text-sm text-ink-muted">/blog/{p.slug}</span>
                    </TD>
                    <TD>
                      <Badge tone={s.tone} dot>
                        {s.label}
                      </Badge>
                    </TD>
                    <TD className="text-ink-muted">{p.author_name ?? "None"}</TD>
                    <TD className="text-ink-muted">{formatRelative(p.updated_at)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
