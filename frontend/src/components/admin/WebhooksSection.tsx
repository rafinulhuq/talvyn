"use client";

import { useEffect, useReducer, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";

import { webhooksApi } from "@/lib/api/webhooks";
import {
  WEBHOOK_EVENT_TYPES,
  type CreateWebhookResponse,
  type WebhookDelivery,
  type WebhookSubscription,
} from "@/types/webhooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const EVENT_LABELS: Record<string, string> = {
  "invitation.created": "Invitation created",
  "attempt.started": "Test started",
  "attempt.submitted": "Test submitted",
  "attempt.terminated": "Integrity violation",
  "evaluation.completed": "Evaluation ready",
};

function statusBadgeVariant(status: string): "green" | "red" | "yellow" {
  if (status === "SUCCESS") return "green";
  if (status === "FAILED") return "red";
  return "yellow";
}

function NewSecretReveal({
  webhook,
  onDismiss,
}: {
  webhook: CreateWebhookResponse;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(webhook.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs dark:border-indigo-900/60 dark:bg-indigo-950/40">
      <p className="font-semibold text-indigo-950 dark:text-indigo-200">
        Signing secret generated. Save this secret now — it won&apos;t be shown again.
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 shadow-xs dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-200">
          {webhook.secret}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          leftIcon={copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Dismiss secret
      </button>
    </div>
  );
}

function DeliveryLog({ subscriptionId }: { subscriptionId: string }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    webhooksApi.listDeliveries(subscriptionId, 1, 10).then((res) => {
      if (cancelled || !res.success) return;
      setDeliveries(res.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  if (deliveries === null) {
    return <p className="py-2 text-xs text-slate-500 dark:text-slate-400">Loading deliveries...</p>;
  }
  if (deliveries.length === 0) {
    return <p className="py-2 text-xs text-slate-500 dark:text-slate-400">No deliveries yet.</p>;
  }

  return (
    <ul className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      {deliveries.map((d) => (
        <li key={d.id} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                d.status === "SUCCESS"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400"
              }`}
            >
              {d.status}
            </span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{d.event_type}</span>
            {d.response_status_code !== null && (
              <span className="text-slate-400 font-mono">[{d.response_status_code}]</span>
            )}
          </div>
          <span className="text-slate-400">
            {new Date(d.created_at).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WebhookRow({
  webhook,
  onChanged,
}: {
  webhook: WebhookSubscription;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  async function handleToggle() {
    setBusy(true);
    try {
      await webhooksApi.setActive(webhook.id, !webhook.is_active);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete webhook for ${webhook.url}?`)) return;
    setBusy(true);
    try {
      await webhooksApi.remove(webhook.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setTestMessage(null);
    try {
      const res = await webhooksApi.sendTestEvent(webhook.id);
      setTestMessage(
        res.success ? "Test event sent." : `Test event failed: ${res.error.message}`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
              {webhook.url}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
              webhook.is_active
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            }`}>
              {webhook.is_active ? "Active" : "Disabled"}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {webhook.event_types.map((type) => (
              <span key={type} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {EVENT_LABELS[type] ?? type}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleTest} leftIcon={<Send className="h-3.5 w-3.5" />}>
            Test
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleToggle}>
            {webhook.is_active ? "Disable" : "Enable"}
          </Button>
          <Button type="button" variant="danger" size="sm" disabled={busy} onClick={handleDelete} leftIcon={<Trash2 className="h-3.5 w-3.5" />}>
            Delete
          </Button>
        </div>
      </div>

      {testMessage && (
        <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">{testMessage}</p>
      )}

      <button
        type="button"
        onClick={() => setShowDeliveries((v) => !v)}
        className="mt-3 block text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {showDeliveries ? "Hide deliveries" : "Show deliveries"}
      </button>
      {showDeliveries && <DeliveryLog subscriptionId={webhook.id} />}
    </div>
  );
}

type ListState = { items: WebhookSubscription[]; loading: boolean };

const EMPTY_FORM = { url: "", selectedEvents: [] as string[] };
type FormFields = typeof EMPTY_FORM;
type FormAction =
  | { type: "setUrl"; value: string }
  | { type: "toggleEvent"; eventType: string }
  | { type: "reset" };

function formReducer(state: FormFields, action: FormAction): FormFields {
  switch (action.type) {
    case "setUrl":
      return { ...state, url: action.value };
    case "toggleEvent":
      return {
        ...state,
        selectedEvents: state.selectedEvents.includes(action.eventType)
          ? state.selectedEvents.filter((t) => t !== action.eventType)
          : [...state.selectedEvents, action.eventType],
      };
    case "reset":
      return EMPTY_FORM;
  }
}

type CreateStatus =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "error"; message: string };

export function WebhooksSection() {
  const [list, setList] = useState<ListState>({ items: [], loading: true });
  const [formFields, dispatchFormFields] = useReducer(formReducer, EMPTY_FORM);
  const { url, selectedEvents } = formFields;
  const [createStatus, setCreateStatus] = useState<CreateStatus>({ phase: "idle" });
  const [newSecret, setNewSecret] = useState<CreateWebhookResponse | null>(null);

  async function load() {
    setList((prev) => ({ ...prev, loading: true }));
    try {
      const res = await webhooksApi.list();
      if (res.success) setList((prev) => ({ ...prev, items: res.data }));
    } finally {
      setList((prev) => ({ ...prev, loading: false }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleEvent(type: string) {
    dispatchFormFields({ type: "toggleEvent", eventType: type });
  }

  async function handleCreate() {
    setCreateStatus({ phase: "idle" });
    if (!url.trim() || selectedEvents.length === 0) {
      setCreateStatus({ phase: "error", message: "URL and at least one event type are required." });
      return;
    }
    setCreateStatus({ phase: "creating" });
    const res = await webhooksApi.create(url.trim(), selectedEvents);
    if (!res.success) {
      setCreateStatus({ phase: "error", message: res.error.message });
      return;
    }
    setCreateStatus({ phase: "idle" });
    setNewSecret(res.data);
    dispatchFormFields({ type: "reset" });
    await load();
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Webhooks</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Deliver signed HTTP events for invitations, test attempts, and evaluations to
          your own endpoints, Zapier, or an ATS.
        </p>
      </div>

      {newSecret && (
        <NewSecretReveal webhook={newSecret} onDismiss={() => setNewSecret(null)} />
      )}

      {createStatus.phase === "error" && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {createStatus.message}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-800/40">
        <Input
          label="Endpoint URL"
          placeholder="https://your-app.com/webhooks/talvyn"
          value={url}
          onChange={(e) => dispatchFormFields({ type: "setUrl", value: e.target.value })}
          disabled={createStatus.phase === "creating"}
        />
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Events</p>
          <div className="flex flex-wrap gap-4">
            {WEBHOOK_EVENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(type)}
                  onChange={() => toggleEvent(type)}
                  disabled={createStatus.phase === "creating"}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
                <span className="font-medium">{EVENT_LABELS[type]}</span>
              </label>
            ))}
          </div>
        </div>
        <Button
          type="button"
          loading={createStatus.phase === "creating"}
          onClick={handleCreate}
          className="self-start"
        >
          Add webhook
        </Button>
      </div>

      {list.loading ? (
        <div className="flex justify-center py-6 text-xs text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
        </div>
      ) : list.items.length === 0 ? (
        <p className="py-4 text-xs text-slate-500 dark:text-slate-400">No webhooks configured yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.items.map((webhook) => (
            <WebhookRow key={webhook.id} webhook={webhook} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
