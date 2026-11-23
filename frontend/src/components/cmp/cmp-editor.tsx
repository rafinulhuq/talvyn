"use client";

import { ExternalLink, History, RotateCcw, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import { DOCS } from "@/lib/cms/docs";
import { JsonForm } from "./json-form";

import type { Obj } from "./json-form";
export type CmsDoc = { key: string; draft_json: Obj; published_json: Obj | null; updated_at: string; published_at: string | null; latest_version: number; has_unpublished_changes: boolean };
type Version = { version: number; created_by_name: string | null; created_at: string; is_current: boolean };


const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Edits one CMP document: save draft, publish, history. `live` is what
 * visitors see now (backend defaults merged with the last publish); when the
 * stored draft differs from it and nothing was ever published, the draft is
 * stale and publishing it would replace the live copy.
 */
export function CmpEditor({ doc, live }: { doc: CmsDoc; live: Obj | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Obj>(doc.draft_json);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState<Version[] | null>(null);
  const [error, setError] = useState<string>();
  const dirty = !same(draft, doc.draft_json);
  const stale = live !== null && doc.published_json === null && !same(doc.draft_json, live);
  const meta = DOCS[doc.key]!;

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(undefined);
    const res = await api(`/api/v1/cmp/documents/${doc.key}`, { method: "PATCH", body: { draft_json: draft } });
    setSaving(false);
    if (!res.ok) {
      setError(res.error.message);
      return false;
    }
    toast({ title: "Draft saved", description: "Visitors still see the published version." });
    router.refresh();
    return true;
  }

  async function publish() {
    if (dirty && !(await save())) return;
    setPublishing(true);
    const res = await api<{ version: { version: number } }>(`/api/v1/cmp/documents/${doc.key}/publish`, { method: "POST", body: {} });
    setPublishing(false);
    setConfirm(false);
    if (!res.ok) return setError(res.error.message);
    toast({ title: `${meta.label} published`, description: `Live now as version ${res.data.version.version}.`, tone: "success" });
    router.refresh();
  }

  async function openHistory() {
    setHistory([]);
    const res = await api<{ items: Version[] }>(`/api/v1/cmp/documents/${doc.key}/versions?limit=50`);
    setHistory(res.ok ? res.data.items : []);
  }

  async function restore(v: number) {
    const res = await api(`/api/v1/cmp/documents/${doc.key}/restore-version`, { method: "POST", body: { version: v } });
    if (!res.ok) return toast({ title: "Not restored", description: res.error.message, tone: "danger" });
    setHistory(null);
    toast({ title: `Version ${v} copied to the draft`, description: "Review it, then publish to make it live." });
    router.refresh();
  }

  // When the server copy changes (after save, publish or restore), start from it.
  const [seen, setSeen] = useState(doc.updated_at);
  if (seen !== doc.updated_at) {
    setSeen(doc.updated_at);
    setDraft(doc.draft_json);
  }

  const status = doc.published_at ? (doc.has_unpublished_changes || dirty ? { l: "Unpublished changes", t: "warning" } : { l: "Published", t: "success" }) : { l: "Using the built-in copy", t: "neutral" };

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-1 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-md font-medium text-ink">
            {meta.label}
            <Badge tone={status.t as "warning" | "success" | "neutral"} dot>
              {status.l}
            </Badge>
          </p>
          <p className="text-sm text-ink-muted">
            {doc.published_at ? `Last published ${formatRelative(doc.published_at)}` : "Never published"}
            {dirty ? ". You have unsaved edits." : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta.preview && (
            <Button variant="ghost" asChild>
              <Link href={meta.preview} target="_blank">
                <ExternalLink aria-hidden className="size-4" /> View live
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={() => void openHistory()} disabled={doc.latest_version === 0}>
            <History aria-hidden className="size-4" /> History
          </Button>
          <Button variant="secondary" disabled={!dirty} loading={saving} onClick={() => void save()}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => setConfirm(true)} disabled={!dirty && !doc.has_unpublished_changes && !!doc.published_at}>
            <Upload aria-hidden className="size-4" /> Publish
          </Button>
        </div>
      </div>

      {stale && (
        <Alert title="This draft is older than what visitors see">
          The live copy comes from Talvyn&apos;s current defaults, and this stored draft differs from it. Publishing it would replace the live copy.
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => setDraft(live!)}>
              <RotateCcw aria-hidden className="size-3.5" /> Use the live version as the draft
            </Button>
          </div>
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      <JsonForm value={draft} docKey={doc.key} onChange={setDraft} />

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title={`Publish ${meta.label.toLowerCase()}?`}
          description={dirty ? "Your edits are saved, then go live straight away. The current live version stays in History." : "The saved draft goes live straight away. The current live version stays in History."}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Not yet</Button>
              </DialogClose>
              <Button variant="primary" loading={publishing || saving} onClick={() => void publish()}>
                Publish
              </Button>
            </>
          }
        />
      </Dialog>

      <Sheet open={history !== null} onOpenChange={(o) => !o && setHistory(null)}>
        <SheetContent title="Published versions" description="Copy an older version into the draft, then publish it to roll back.">
          <ul className="flex flex-col gap-2">
            {(history ?? []).map((v) => (
              <li key={v.version} className={cn("flex items-center justify-between gap-3 rounded-control border px-3 py-2", v.is_current ? "border-accent/40" : "border-line")}>
                <span>
                  <span className="block text-base text-ink">
                    Version {v.version}
                    {v.is_current && <span className="ml-2 text-sm text-accent">Live</span>}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {formatDateTime(v.created_at)}
                    {v.created_by_name ? `, ${v.created_by_name}` : ""}
                  </span>
                </span>
                {!v.is_current && (
                  <Button size="sm" variant="secondary" onClick={() => void restore(v.version)}>
                    Copy to draft
                  </Button>
                )}
              </li>
            ))}
            {history?.length === 0 && <li className="text-base text-ink-muted">Nothing published yet.</li>}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
