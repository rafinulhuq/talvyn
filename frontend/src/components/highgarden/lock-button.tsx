"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";

/** Ends the 4-hour unlock early. */
export function LockButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function lock() {
    setBusy(true);
    const res = await api("/api/highgarden/lock", { method: "POST", base: "" });
    setBusy(false);
    if (!res.ok) return toast({ title: "Not locked", description: res.error.message, tone: "danger" });
    router.replace("/dashboard/highgarden/unlock");
    router.refresh();
  }
  return (
    <Button variant="secondary" onClick={() => void lock()} loading={busy}>
      <Lock aria-hidden className="size-4" /> Lock
    </Button>
  );
}
