"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { EVENT_LABEL } from "@/lib/highgarden";

type Body = { mode: "retention" } | { mode: "filter"; type?: string; from?: string; to?: string };

function usePurge(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(body: Body) {
    setBusy(true);
    const res = await api<{ deletedEvents: number }>("/api/highgarden/purge", { method: "POST", base: "", body });
    setBusy(false);
    if (!res.ok) return toast({ title: "Nothing deleted", description: res.error.message, tone: "danger" });
    onDone();
    toast({ title: `${res.data.deletedEvents.toLocaleString("en")} event${res.data.deletedEvents === 1 ? "" : "s"} deleted`, tone: "success" });
    router.refresh();
  }
  return { busy, run };
}

export function RetentionPurge() {
  const [open, setOpen] = useState<"retention" | "filter" | null>(null);
  const { busy, run } = usePurge(() => setOpen(null));
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filterReady = type !== "all" || from || to;

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setOpen("retention")}>
        <Trash2 aria-hidden className="size-3.5" /> Delete events older than 90 days
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("filter")}>
        Delete by type or date…
      </Button>

      <Dialog open={open === "retention"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          title="Delete events older than 90 days?"
          description="Raw page views, clicks, errors and dead clicks past the retention window are removed for good. Feedback is kept."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button variant="danger" loading={busy} onClick={() => void run({ mode: "retention" })}>
                Delete old events
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={open === "filter"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          title="Delete events by type or date"
          description="Removes matching raw events permanently. Dates are UTC and include both ends."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                variant="danger"
                loading={busy}
                disabled={!filterReady}
                onClick={() => void run({ mode: "filter", type: type === "all" ? undefined : type, from: from || undefined, to: to || undefined })}
              >
                Delete matching events
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Event type">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any type</SelectItem>
                  {Object.entries(EVENT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="From" optional>
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To" optional>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
