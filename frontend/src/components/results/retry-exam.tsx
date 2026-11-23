"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";

/** Re-queues scoring for a sectioned exam whose scoring failed. */
export function RetryExamScoring({ examId }: { examId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await api(`/api/v1/exam-admin/attempts/${examId}/retry-evaluation`, { method: "POST", body: {} });
    setBusy(false);
    if (!res.ok) return toast({ title: "Couldn't restart scoring", description: res.error.message, tone: "danger" });
    toast({ title: "Scoring restarted", description: "Refresh in a few minutes to see the result." });
    router.refresh();
  }
  return (
    <Button variant="primary" loading={busy} onClick={() => void go()}>
      <RefreshCw aria-hidden className="size-4" /> Try scoring again
    </Button>
  );
}
