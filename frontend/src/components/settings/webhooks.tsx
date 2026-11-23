"use client";

import { Copy, MoreHorizontal, Plus, Send, Trash2, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { formatDateTime, formatRelative } from "@/lib/format";

export type WebhookSub = { id: string; url: string; event_types: string[]; is_active: boolean; created_at: string; updated_at: string };
type Delivery = { id: string; event_type: string; status: string; response_status_code: number | null; attempt_count: number; error_message: string | null; created_at: string; delivered_at: string | null };

/** The events the backend actually sends (webhook_service callers). */
export const EVENTS: [string, string][] = [
  ["invitation.created", "Invitation sent"],
  ["attempt.started", "Test started"],
  ["attempt.submitted", "Test submitted"],
  ["attempt.terminated", "Test ended for integrity"],
  ["evaluation.completed", "Test scored"],
];
const label = (e: string) => (e === "webhook.test" ? "Test event" : (EVENTS.find(([k]) => k === e)?.[1] ?? e));

export function Webhooks({ items }: { items: WebhookSub[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookSub | null>(null);
  const [removing, setRemoving] = useState<WebhookSub | null>(null);

  async function toggle(w: WebhookSub) {
    const res = await api(`/api/v1/admin/webhooks/${w.id}`, { method: "PATCH", body: { is_active: !w.is_active } });
    if (!res.ok) return toast({ title: "Not changed", description: res.error.message, tone: "danger" });
    toast({ title: w.is_active ? "Webhook paused" : "Webhook resumed" });
    router.refresh();
  }
  async function test(w: WebhookSub) {
    const res = await api(`/api/v1/admin/webhooks/${w.id}/test`, { method: "POST", body: {} });
    if (!res.ok) return toast({ title: "Test not sent", description: res.error.message, tone: "danger" });
    toast({ title: "Test event queued", description: "Check its delivery in a few seconds." });
  }
  async function remove(w: WebhookSub) {
    const res = await api(`/api/v1/admin/webhooks/${w.id}`, { method: "DELETE" });
    setRemoving(null);
    if (!res.ok) return toast({ title: "Not deleted", description: res.error.message, tone: "danger" });
    toast({ title: "Webhook deleted" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-base text-ink-muted">Send hiring events to your own systems, such as an ATS or a Slack bot. Each request is signed with the webhook&apos;s secret so you can verify it came from Talvyn.</p>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-4" /> Add webhook
        </Button>
      </div>
      {secret && (
        <Alert tone="success" title="Webhook added. Copy its signing secret now">
          You won&apos;t see it again.
          <span className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink">{secret}</code>
            <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(secret).then(() => toast({ title: "Secret copied" }))}>
              <Copy aria-hidden className="size-3.5" /> Copy
            </Button>
          </span>
        </Alert>
      )}
      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        {items.length === 0 ? (
          <EmptyState icon={Webhook} title="No webhooks yet" description="Add one to receive events like test submissions and scores." />
        ) : (
          <Table aria-label="Webhooks">
            <THead>
              <tr>
                <TH>Endpoint</TH>
                <TH>Events</TH>
                <TH>Active</TH>
                <TH className="w-12">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {items.map((w) => (
                <TR key={w.id}>
                  <TD>
                    <button type="button" className="max-w-md truncate text-left font-mono text-sm text-ink hover:text-accent" onClick={() => setDeliveriesFor(w)}>
                      {w.url}
                    </button>
                    <span className="block text-sm text-ink-muted">Added {formatRelative(w.created_at)}</span>
                  </TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      {w.event_types.map((e) => (
                        <Badge key={e}>{label(e)}</Badge>
                      ))}
                    </span>
                  </TD>
                  <TD>
                    <Switch checked={w.is_active} onCheckedChange={() => void toggle(w)} aria-label={`${w.url} active`} />
                  </TD>
                  <TD>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label="Webhook actions">
                          <MoreHorizontal aria-hidden className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => void test(w)}>
                          <Send aria-hidden /> Send a test event
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDeliveriesFor(w)}>
                          <Webhook aria-hidden /> Recent deliveries
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setRemoving(w)}>
                          <Trash2 aria-hidden /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <CreateWebhook open={creating} onOpenChange={setCreating} onCreated={(s) => (setSecret(s), router.refresh())} />
      <Deliveries sub={deliveriesFor} onClose={() => setDeliveriesFor(null)} />
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent
          title="Delete this webhook?"
          description="Events stop being sent to it straight away. Its delivery history is deleted too."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep it</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => removing && void remove(removing)}>
                Delete webhook
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}

function CreateWebhook({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (secret: string) => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(EVENTS.map(([k]) => k));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^https:\/\//i.test(url.trim())) return setError("Use an https:// address.");
    if (!events.length) return setError("Pick at least one event.");
    setBusy(true);
    setError(undefined);
    const res = await api<{ secret: string }>("/api/v1/admin/webhooks/", { method: "POST", body: { url: url.trim(), event_types: events } });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    onOpenChange(false);
    setUrl("");
    onCreated(res.data.secret);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), setError(undefined))}>
      <DialogContent title="Add a webhook" description="Talvyn sends a signed POST request to this address for each event you choose.">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Endpoint URL" hint="Public https address. Private and local addresses are refused.">
            <Input type="url" inputMode="url" placeholder="https://hooks.example.com/talvyn" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Events</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {EVENTS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2.5 text-base text-ink">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={events.includes(k)} onChange={(e) => setEvents((x) => (e.target.checked ? [...x, k] : x.filter((y) => y !== k)))} />
                  {l}
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
              Add webhook
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Deliveries({ sub, onClose }: { sub: WebhookSub | null; onClose: () => void }) {
  return (
    <Sheet open={sub !== null} onOpenChange={(o) => !o && onClose()}>
      {sub && (
        <SheetContent title="Recent deliveries" description={sub.url}>
          <DeliveryList key={sub.id} id={sub.id} />
        </SheetContent>
      )}
    </Sheet>
  );
}

function DeliveryList({ id }: { id: string }) {
  const [state, setState] = useState<{ items: Delivery[] } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    void api<{ items: Delivery[] }>(`/api/v1/admin/webhooks/${id}/deliveries?page=1&page_size=20`).then((r) => live && setState(r.ok ? r.data : { error: r.error.message }));
    return () => {
      live = false;
    };
  }, [id]);
  if (state === null) return <p className="text-base text-ink-muted">Loading deliveries</p>;
  if ("items" in state && state.items.length === 0) return <p className="text-base text-ink-muted">No deliveries yet. Send a test event to try it.</p>;
  if ("error" in state) return <Alert tone="danger">{state.error}</Alert>;
  return (
    <ul className="flex flex-col gap-2">
      {state.items.map((d) => (
        <li key={d.id} className="rounded-control border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base text-ink">{label(d.event_type)}</span>
            <Badge tone={d.status === "SUCCESS" ? "success" : d.status === "FAILED" ? "danger" : "warning"}>
              {d.response_status_code ? `${d.response_status_code} ` : ""}
              {d.status.toLowerCase()}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDateTime(d.created_at)}, {d.attempt_count} {d.attempt_count === 1 ? "attempt" : "attempts"}
          </p>
          {d.error_message && <p className="mt-1 break-words font-mono text-xs text-danger">{d.error_message}</p>}
        </li>
      ))}
    </ul>
  );
}
