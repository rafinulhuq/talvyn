"use client";

import { Link2, Pause, Play, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import type { PublicLink, PublicLinkAnalytics } from "@/types/invitation";
import { CopyButton } from "./shared";

const STATUS = {
  ACTIVE: { label: "Accepting candidates", tone: "success" },
  DISABLED: { label: "Paused", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "warning" },
} as const;

/** Date input value (local) ↔ ISO end-of-day. */
const toInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");
const fromInput = (v: string) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);

export function PublicLinkPanel({ jdId, link, analytics }: { jdId: string; link: PublicLink | null; analytics: PublicLinkAnalytics | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);

  async function create(body: { expires_at: string | null; max_registrations: number | null }) {
    setBusy(true);
    const res = await api<PublicLink>(`/api/v1/public-links/jd/${jdId}`, { method: "POST", body });
    setBusy(false);
    if (!res.ok) return res.error.message;
    toast({ title: "Public link created", tone: "success" });
    router.refresh();
    return null;
  }

  async function update(body: Record<string, unknown>, done: string) {
    if (!link) return "No link";
    setBusy(true);
    const res = await api<PublicLink>(`/api/v1/public-links/${link.id}`, { method: "PATCH", body });
    setBusy(false);
    if (!res.ok) return res.error.message;
    toast({ title: done });
    router.refresh();
    return null;
  }

  if (!link) {
    return (
      <div className="max-w-3xl rounded-panel border border-line bg-surface">
        <EmptyState
          icon={Link2}
          title="Share one link with everyone"
          description="Post it on a job board or careers page. Candidates enter their own name and email, then start straight away. Each person can take the tests once."
          action={
            <Button variant="primary" onClick={() => setLimitsOpen(true)}>
              Create public link
            </Button>
          }
        />
        <LimitsDialog open={limitsOpen} onOpenChange={setLimitsOpen} link={null} busy={busy} onSave={(v) => create(v)} />
      </div>
    );
  }

  const st = STATUS[link.status];
  const funnel = analytics
    ? [
        { label: "Viewed", n: analytics.views },
        { label: "Registered", n: analytics.registrations },
        { label: "Started", n: analytics.starts },
        { label: "Completed", n: analytics.completions },
      ]
    : null;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section className="rounded-panel border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLimitsOpen(true)}>
              <SlidersHorizontal aria-hidden className="size-3.5" /> Limits
            </Button>
            {link.status === "ACTIVE" ? (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void update({ status: "DISABLED" }, "Link paused")}>
                <Pause aria-hidden className="size-3.5" /> Pause
              </Button>
            ) : link.status === "DISABLED" ? (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void update({ status: "ACTIVE" }, "Link reopened")}>
                <Play aria-hidden className="size-3.5" /> Reopen
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-sunken px-3 py-2 font-mono text-sm text-ink">{link.public_url}</code>
          <CopyButton value={link.public_url} size="md" />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {link.max_registrations ? `${link.registration_count} of ${link.max_registrations} places taken. ` : `${link.registration_count} registered. `}
          {link.expires_at ? `Closes ${formatDate(link.expires_at)}.` : "No closing date."}
          {link.status === "DISABLED" && " While paused, nobody new can register."}
        </p>
      </section>

      {funnel && (
        <section aria-label="Link funnel" className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
          {funnel.map((f) => (
            <div key={f.label} className="bg-surface px-4 py-3">
              <p className="text-sm text-ink-muted">{f.label}</p>
              <p className="text-xl text-ink">{f.n}</p>
            </div>
          ))}
        </section>
      )}
      {analytics && analytics.evaluated_attempts > 0 && analytics.pass_rate != null && (
        <p className="text-sm text-ink-muted">
          {Math.round(analytics.pass_rate * 100)}% of {analytics.evaluated_attempts} scored attempts were recommended for hire.
        </p>
      )}

      <LimitsDialog open={limitsOpen} onOpenChange={setLimitsOpen} link={link} busy={busy} onSave={(v) => update(v, "Limits saved")} />
    </div>
  );
}

function LimitsDialog({
  open,
  onOpenChange,
  link,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  link: PublicLink | null;
  busy: boolean;
  onSave: (v: { expires_at: string | null; max_registrations: number | null }) => Promise<string | null>;
}) {
  const [closes, setCloses] = useState(toInput(link?.expires_at ?? null));
  const [cap, setCap] = useState(link?.max_registrations ? String(link.max_registrations) : "");
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = cap.trim() ? Number(cap) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1)) return setError("Use a whole number of 1 or more, or leave it empty.");
    // The backend treats an empty value as "unchanged", so a limit can be changed but not removed.
    if (link?.expires_at && !closes) return setError("A closing date can be moved but not removed. Pick a later date instead.");
    if (link?.max_registrations && n === null) return setError("A maximum can be raised but not removed. Enter a larger number instead.");
    if (closes && new Date(`${closes}T23:59:59`) < new Date()) return setError("Pick a closing date in the future.");
    const err = await onSave({ expires_at: fromInput(closes), max_registrations: n });
    if (err) return setError(err);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), setError(undefined))}>
      <DialogContent
        title={link ? "Link limits" : "Create a public link"}
        description={link ? "Once set, a limit can be changed but not removed." : "Both are optional. Once set, a limit can be changed but not removed."}
      >
        <form id="limits" onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Closing date" optional hint="Closes at the end of this day">
              <Input type="date" value={closes} onChange={(e) => (setCloses(e.target.value), setError(undefined))} />
            </Field>
            <Field label="Maximum candidates" optional>
              <Input type="number" inputMode="numeric" min={1} value={cap} onChange={(e) => (setCap(e.target.value), setError(undefined))} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={busy}>
              {link ? "Save limits" : "Create link"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
