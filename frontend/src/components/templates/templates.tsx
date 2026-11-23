"use client";

import { Archive, LayoutTemplate, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { formatRelative } from "@/lib/format";
import { SECTION_LABEL, SECTION_ORDER, type SectionType } from "@/types/attempt";

export type Template = {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  updated_at: string;
  config_json: { mcq_target?: number | null; cq_target?: number | null; section_weights?: Partial<Record<SectionType, number>> | null };
};

/** Weights are stored as given and normalised when scoring; show them as shares of the total. */
function shares(w: Template["config_json"]["section_weights"]) {
  if (!w) return null;
  const sum = SECTION_ORDER.reduce((a, s) => a + (w[s] ?? 0), 0);
  if (!sum) return null;
  return SECTION_ORDER.map((s) => `${SECTION_LABEL[s]} ${Math.round(((w[s] ?? 0) / sum) * 100)}%`).join(", ");
}

export function Templates({ items, canEdit }: { items: Template[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  async function archive(t: Template) {
    const res = await api(`/api/v1/templates/${t.id}/archive`, { method: "POST", body: {} });
    if (!res.ok) return toast({ title: "Not archived", description: res.error.message, tone: "danger" });
    toast({ title: `${t.name} archived`, description: "It no longer appears as a bank size option." });
    router.refresh();
  }
  async function remove(t: Template) {
    const res = await api(`/api/v1/templates/${t.id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) return toast({ title: "Not deleted", description: res.error.message, tone: "danger" });
    toast({ title: `${t.name} deleted` });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-base text-ink-muted">Saved question bank settings: how many questions each section gets, and how much each section counts toward the final score. Pick one when you build a role&apos;s question bank.</p>
        {canEdit && (
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus aria-hidden className="size-4" /> New template
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        {items.length === 0 ? (
          <EmptyState icon={LayoutTemplate} title="No templates yet" description="Create one to reuse the same bank size and section weights across roles." />
        ) : (
          <Table aria-label="Exam templates">
            <THead>
              <tr>
                <TH>Template</TH>
                <TH>Per section</TH>
                <TH>Section weights</TH>
                <TH>Status</TH>
                <TH>Updated</TH>
                {canEdit && (
                  <TH className="w-12">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </tr>
            </THead>
            <tbody>
              {items.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <span className="block font-medium text-ink">{t.name}</span>
                    {t.description && <span className="block max-w-md text-sm text-ink-muted">{t.description}</span>}
                  </TD>
                  <TD className="text-ink">
                    {t.config_json.mcq_target ?? "Default"} multiple choice, {t.config_json.cq_target ?? "default"} written
                  </TD>
                  <TD className="text-ink-muted">{shares(t.config_json.section_weights) ?? "Default weights"}</TD>
                  <TD>
                    <Badge tone={t.status === "ACTIVE" ? "success" : "neutral"} dot>
                      {t.status === "ACTIVE" ? "In use" : t.status === "ARCHIVED" ? "Archived" : "Draft"}
                    </Badge>
                  </TD>
                  <TD className="text-ink-muted">{formatRelative(t.updated_at)}</TD>
                  {canEdit && (
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={`Actions for ${t.name}`}>
                            <MoreHorizontal aria-hidden className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setEditing(t)}>
                            <Pencil aria-hidden /> Edit
                          </DropdownMenuItem>
                          {t.status !== "ARCHIVED" && (
                            <DropdownMenuItem onSelect={() => void archive(t)}>
                              <Archive aria-hidden /> Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => setDeleting(t)}>
                            <Trash2 aria-hidden /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <TemplateDialog key={editing === "new" ? "new" : (editing?.id ?? "none")} template={editing} onClose={() => setEditing(null)} />
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent
          title={`Delete ${deleting?.name ?? "template"}?`}
          description="Question banks already built with it keep their questions. This can't be undone; archive it instead to keep it on record."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep it</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => deleting && void remove(deleting)}>
                Delete template
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}

function TemplateDialog({ template, onClose }: { template: Template | "new" | null; onClose: () => void }) {
  const router = useRouter();
  const t = template && template !== "new" ? template : null;
  const w = t?.config_json.section_weights ?? {};
  const [v, setV] = useState({
    name: t?.name ?? "",
    description: t?.description ?? "",
    mcq: String(t?.config_json.mcq_target ?? 40),
    cq: String(t?.config_json.cq_target ?? 20),
    REASONING: String(w.REASONING ?? 1),
    PRACTICAL: String(w.PRACTICAL ?? 1),
    TECHNICAL: String(w.TECHNICAL ?? 1),
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => (setV((x) => ({ ...x, [k]: e.target.value })), setError(undefined));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const mcq = Number(v.mcq);
    const cq = Number(v.cq);
    const raw = Object.fromEntries(SECTION_ORDER.map((s) => [s, Number(v[s])]));
    const rawTotal = Object.values(raw).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    // The backend requires weights that sum to 1.0 (within 0.01); store them as shares.
    const weights = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, rawTotal > 0 ? Math.round((x / rawTotal) * 10000) / 10000 : x]));
    if (!v.name.trim()) return setError("Give the template a name.");
    if (!Number.isInteger(mcq) || mcq < 1 || mcq > 200) return setError("Multiple choice per section must be a whole number from 1 to 200.");
    if (!Number.isInteger(cq) || cq < 1 || cq > 100) return setError("Written per section must be a whole number from 1 to 100.");
    if (Object.values(raw).some((x) => !Number.isFinite(x) || x < 0) || rawTotal <= 0) return setError("Weights must be zero or more, and at least one must be above zero.");
    setBusy(true);
    const body = { name: v.name.trim(), description: v.description.trim() || null, mcq_target: mcq, cq_target: cq, section_weights: weights };
    const res = t ? await api(`/api/v1/templates/${t.id}`, { method: "PATCH", body }) : await api("/api/v1/templates/", { method: "POST", body });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    toast({ title: t ? "Template saved" : "Template created", tone: "success" });
    onClose();
    router.refresh();
  }

  const total = SECTION_ORDER.reduce((a, s) => a + (Number(v[s]) || 0), 0);
  return (
    <Dialog open={template !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t ? `Edit ${t.name}` : "New template"} className="max-w-xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Name">
            <Input value={v.name} onChange={set("name")} placeholder="Senior engineering" />
          </Field>
          <Field label="Description" optional>
            <Textarea rows={2} maxLength={1000} value={v.description} onChange={set("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Multiple choice per section" hint="1 to 200">
              <Input type="number" inputMode="numeric" value={v.mcq} onChange={set("mcq")} />
            </Field>
            <Field label="Written per section" hint="1 to 100">
              <Input type="number" inputMode="numeric" value={v.cq} onChange={set("cq")} />
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Section weights</legend>
            <p className="text-sm text-ink-muted">How much each section counts toward the final score. Any numbers work; they&apos;re turned into shares.</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {SECTION_ORDER.map((s) => (
                <label key={s} className="flex flex-col gap-1 text-sm text-ink-muted">
                  {SECTION_LABEL[s]}
                  <Input type="number" inputMode="decimal" min={0} step="any" value={v[s]} onChange={set(s)} />
                  <span>{total > 0 ? `${Math.round(((Number(v[s]) || 0) / total) * 100)}%` : "–"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={busy}>
              {t ? "Save template" : "Create template"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
