"use client";

import { CalendarClock, ExternalLink, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UploadButton } from "@/components/cmp/json-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { postState, type AdminPost, type Author } from "@/types/blog";
import { RichEditor } from "./rich-editor";

const NONE = "__none__";
const slugify = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
type Draft = { title: string; slug: string; excerpt: string; content_md: string; tags: string[]; author: string; seo_title: string; seo_description: string; cover_id: string | null; cover_url: string | null };
const from = (p: AdminPost): Draft => ({
  title: p.title,
  slug: p.slug,
  excerpt: p.excerpt ?? "",
  content_md: p.content_md,
  tags: p.tags,
  author: p.author_profile_id ?? NONE,
  seo_title: p.seo_title ?? "",
  seo_description: p.seo_description ?? "",
  cover_id: p.cover_image_asset_id,
  cover_url: p.cover_image_url,
});

export function PostEditor({ post, authors }: { post: AdminPost; authors: Author[] }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => from(post));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<"schedule" | "delete" | null>(null);
  const [when, setWhen] = useState("");
  const [whenOk, setWhenOk] = useState(false);
  const [seen, setSeen] = useState(post.updated_at);
  if (seen !== post.updated_at) {
    setSeen(post.updated_at);
    setD(from(post));
  }
  const initial = from(post);
  const dirty = JSON.stringify(initial) !== JSON.stringify(d);
  const st = postState(post);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // Until it's published or edited by hand, the address follows the title.
  const [slugTouched, setSlugTouched] = useState(post.status === "published" || !/^untitled-post(-\d+)?$/.test(post.slug));
  const setTitle = (t: string) => setD((x) => ({ ...x, title: t, ...(slugTouched ? {} : { slug: slugify(t) }) }));

  async function save(quiet = false): Promise<boolean> {
    if (!d.title.trim()) {
      setError("Give the post a title.");
      return false;
    }
    setBusy("save");
    setError(undefined);
    const res = await api<AdminPost>(`/api/v1/cmp/blog/${post.id}`, {
      method: "PATCH",
      body: {
        title: d.title.trim(),
        slug: d.slug.trim() || null,
        excerpt: d.excerpt.trim() || null,
        content_md: d.content_md,
        tags: d.tags.slice(0, 10),
        seo_title: d.seo_title.trim() || null,
        seo_description: d.seo_description.trim() || null,
        ...(d.author === NONE ? { clear_author_profile: true } : { author_profile_id: d.author }),
        ...(d.cover_id ? { cover_image_asset_id: d.cover_id } : { clear_cover_image: true }),
      },
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return false;
    }
    if (!quiet) toast({ title: "Saved", tone: "success" });
    router.refresh();
    return true;
  }

  async function publish(at?: string) {
    if (dirty && !(await save(true))) return;
    setBusy("publish");
    const res = await api<AdminPost>(`/api/v1/cmp/blog/${post.id}/publish`, { method: "POST", body: at ? { publish_at: new Date(at).toISOString() } : {} });
    setBusy(null);
    setDialog(null);
    if (!res.ok) return setError(res.error.message);
    toast({ title: at ? `Scheduled for ${formatDateTime(new Date(at).toISOString())}` : "Published", tone: "success" });
    router.refresh();
  }

  async function unpublish() {
    setBusy("unpublish");
    const res = await api(`/api/v1/cmp/blog/${post.id}/unpublish`, { method: "POST", body: {} });
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    toast({ title: "Moved back to draft", description: "It's no longer on the public blog." });
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    const res = await api(`/api/v1/cmp/blog/${post.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    toast({ title: "Moved to trash", description: "Restore it from Trash if you need it back." });
    router.push("/dashboard/cmp/blog");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-1 py-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
          {post.published_at && st.label !== "Draft" ? `${st.label === "Scheduled" ? "Goes live" : "Live since"} ${formatDateTime(post.published_at)}` : `Edited ${formatDateTime(post.updated_at)}`}
          {dirty && <span>, unsaved edits</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {st.label === "Published" && (
            <Button variant="ghost" asChild>
              <Link href={`/blog/${post.slug}`} target="_blank">
                <ExternalLink aria-hidden className="size-4" /> View
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={() => setDialog("delete")} aria-label="Move to trash">
            <Trash2 aria-hidden className="size-4" />
          </Button>
          {post.status === "published" && (
            <Button variant="secondary" loading={busy === "unpublish"} onClick={() => void unpublish()}>
              <Undo2 aria-hidden className="size-4" /> Unpublish
            </Button>
          )}
          <Button variant="secondary" disabled={!dirty} loading={busy === "save"} onClick={() => void save()}>
            Save
          </Button>
          {post.status !== "published" && (
            <>
              <Button variant="secondary" onClick={() => setDialog("schedule")}>
                <CalendarClock aria-hidden className="size-4" /> Schedule
              </Button>
              <Button variant="primary" loading={busy === "publish"} onClick={() => void publish()}>
                Publish now
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <Input aria-label="Title" value={d.title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-auto border-0 bg-transparent px-0 font-serif text-[2.25rem] leading-tight shadow-none focus-visible:ring-0" />
          <Textarea aria-label="Summary" rows={2} maxLength={500} value={d.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="One or two sentences shown on the blog index and in search results." />
          <RichEditor value={d.content_md} onChange={(v) => set("content_md", v)} />
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-32">
          <Panel title="Cover image">
            {d.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- CMS media
              <img src={d.cover_url} alt="" className="mb-3 aspect-[16/9] w-full rounded-control border border-line object-cover" />
            ) : (
              <p className="mb-3 text-sm text-ink-muted">None. Posts look fine without one.</p>
            )}
            <div className="flex gap-2">
              <UploadButton label={d.cover_url ? "Replace" : "Upload"} onUploaded={(url, id) => setD((x) => ({ ...x, cover_url: url, cover_id: id }))} />
              {d.cover_url && (
                <Button variant="ghost" onClick={() => setD((x) => ({ ...x, cover_url: null, cover_id: null }))}>
                  Remove
                </Button>
              )}
            </div>
          </Panel>
          <Panel title="Details">
            <div className="flex flex-col gap-4">
              <Field label="Author" optional>
                <Select value={d.author} onValueChange={(v) => set("author", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No author shown</SelectItem>
                    {authors.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tags" hint="Up to 10. Press Enter after each.">
                <TagInput value={d.tags} onChange={(v) => set("tags", v)} max={10} />
              </Field>
              <Field label="Web address" hint={`/blog/${d.slug || "generated-from-the-title"}`}>
                <Input value={d.slug} onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  }} />
              </Field>
            </div>
          </Panel>
          <Panel title="Search engines" description="Optional. The title and summary are used when these are empty.">
            <div className="flex flex-col gap-4">
              <Field label="Search title" optional>
                <Input maxLength={255} value={d.seo_title} onChange={(e) => set("seo_title", e.target.value)} />
              </Field>
              <Field label="Search description" optional>
                <Textarea rows={3} maxLength={500} value={d.seo_description} onChange={(e) => set("seo_description", e.target.value)} />
              </Field>
            </div>
          </Panel>
        </aside>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "schedule" ? (
          <DialogContent
            title="Schedule this post"
            description="It goes live on the public blog at this time, in your time zone."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button variant="primary" disabled={!whenOk} loading={busy === "publish"} onClick={() => void publish(when)}>
                  Schedule
                </Button>
              </>
            }
          >
            <Field label="Publish at">
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => {
                  setWhen(e.target.value);
                  setWhenOk(!!e.target.value && new Date(e.target.value).getTime() > Date.now());
                }}
              />
            </Field>
          </DialogContent>
        ) : (
          <DialogContent
            title={`Move "${post.title}" to trash?`}
            description="It comes off the public blog. You can restore it from Trash."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Keep it</Button>
                </DialogClose>
                <Button variant="danger" loading={busy === "delete"} onClick={() => void remove()}>
                  Move to trash
                </Button>
              </>
            }
          />
        )}
      </Dialog>
    </div>
  );
}
