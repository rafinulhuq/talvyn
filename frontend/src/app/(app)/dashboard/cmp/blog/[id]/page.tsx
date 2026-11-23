import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PostEditor } from "@/components/blog/post-editor";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { roleAtLeast } from "@/lib/roles";
import { loadErrorMessage, serverGet } from "@/server/api";
import { requireAppUser } from "@/server/session";
import type { AdminPost, Author } from "@/types/blog";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAppUser();
  if (!roleAtLeast(me.role, "SUPER_ADMIN")) redirect("/dashboard");
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const [res, authors] = await Promise.all([serverGet<AdminPost>(`/api/v1/cmp/blog/${id}`), serverGet<{ items: Author[] }>("/api/v1/cmp/authors")]);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(res.status)} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader crumbs={[{ label: "Website content", href: "/dashboard/cmp" }, { label: "Blog", href: "/dashboard/cmp/blog" }, { label: res.data.title }]} title="Edit post" className="pb-0" />
      <PostEditor post={res.data} authors={authors.ok ? authors.data.items : []} />
    </div>
  );
}
