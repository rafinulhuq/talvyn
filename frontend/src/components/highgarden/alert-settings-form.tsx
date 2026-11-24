"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { formatRelative } from "@/lib/format";

export type AlertSettingsValue = {
  enabled: boolean;
  weeklyDigestEnabled: boolean;
  recipients: string[];
  errorThreshold: number;
  deadClickThreshold: number;
  dropThreshold: number;
  lastSentAt: string | null;
};

function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <label htmlFor={id} className="text-base text-ink">
          {label}
        </label>
        <p className="text-sm text-ink-muted">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function AlertSettingsForm({ initial }: { initial: AlertSettingsValue }) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, recipients: initial.recipients.join(", ") });
  const [saved, setSaved] = useState(initial.recipients.length > 0);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => (setV((x) => ({ ...x, [k]: val })), setSaved(false));
  const num = (raw: string, max: number) => Math.min(max, Math.max(1, Math.round(Number(raw) || 1)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    const res = await api<{ recipients: string[] }>("/api/highgarden/alerts", {
      method: "PUT",
      base: "",
      body: {
        enabled: v.enabled,
        weeklyDigestEnabled: v.weeklyDigestEnabled,
        recipients: v.recipients,
        errorThreshold: v.errorThreshold,
        deadClickThreshold: v.deadClickThreshold,
        dropThreshold: v.dropThreshold,
      },
    });
    setSaving(false);
    if (!res.ok) return setError(res.error.message);
    // Show what the server kept (invalid addresses are dropped).
    setV((x) => ({ ...x, recipients: res.data.recipients.join(", ") }));
    setSaved(res.data.recipients.length > 0);
    toast({ title: "Alert settings saved", tone: "success" });
    router.refresh();
  }

  async function sendNow() {
    setSending(true);
    const res = await api<{ sent: number }>("/api/highgarden/alerts/send", { method: "POST", base: "" });
    setSending(false);
    if (!res.ok) return toast({ title: "Digest not sent", description: res.error.message, tone: "danger" });
    toast({ title: `Digest sent to ${res.data.sent} recipient${res.data.sent === 1 ? "" : "s"}`, tone: "success" });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <Panel title="Recipients" description="Up to 10 addresses. Invalid ones are dropped when you save.">
        <Field label="Email addresses" error={error} hint="Separate with commas or new lines.">
          <Textarea rows={2} value={v.recipients} onChange={(e) => set("recipients", e.target.value)} placeholder="ops@yourcompany.com, founder@yourcompany.com" />
        </Field>
      </Panel>

      <Panel title="Weekly digest" description="Page views, sessions, errors, dead clicks, feedback and the 3 pages with the most friction, for the last 7 days.">
        <div className="flex flex-col gap-4">
          <ToggleRow id="hg-weekly" label="Weekly digest" hint="Saved as a preference. Talvyn doesn't send it on a schedule yet, so use Send now." checked={v.weeklyDigestEnabled} onChange={(x) => set("weeklyDigestEnabled", x)} />
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={() => void sendNow()} loading={sending} disabled={!saved}>
              <Send aria-hidden className="size-4" /> Send digest now
            </Button>
            <span className="text-sm text-ink-muted">{!saved ? "Save a recipient first." : initial.lastSentAt ? `Last sent ${formatRelative(initial.lastSentAt)}.` : "Not sent yet."}</span>
          </div>
        </div>
      </Panel>

      <Panel title="Alert thresholds" description="Stored for a future automatic check. Nothing evaluates these yet, so no alert email is sent when they're crossed.">
        <div className="flex flex-col gap-4">
          <ToggleRow id="hg-alerts" label="Threshold alerts" hint="Turn on once automatic checks exist." checked={v.enabled} onChange={(x) => set("enabled", x)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Client errors per day">
              <Input type="number" min={1} max={1000} value={v.errorThreshold} onChange={(e) => set("errorThreshold", num(e.target.value, 1000))} className="tabular-nums" />
            </Field>
            <Field label="Dead clicks per day">
              <Input type="number" min={1} max={1000} value={v.deadClickThreshold} onChange={(e) => set("deadClickThreshold", num(e.target.value, 1000))} className="tabular-nums" />
            </Field>
            <Field label="Funnel drop, %">
              <Input type="number" min={1} max={100} value={v.dropThreshold} onChange={(e) => set("dropThreshold", num(e.target.value, 100))} className="tabular-nums" />
            </Field>
          </div>
        </div>
      </Panel>

      <div>
        <Button type="submit" variant="primary" loading={saving}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
