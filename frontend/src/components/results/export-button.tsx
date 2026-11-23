"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Downloads a binary export through the authenticated proxy. */
export function ExportButton({ path, filename, label }: { path: string; filename: string; label: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy${path}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const disp = res.headers.get("content-disposition") ?? "";
      const name = /filename="?([^";]+)"?/.exec(disp)?.[1] ?? filename;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast({ title: "The download didn't start", description: "Try again in a moment.", tone: "danger" });
    }
    setBusy(false);
  }
  return (
    <Button data-print="hide" variant="secondary" loading={busy} onClick={() => void go()}>
      <Download aria-hidden className="size-4" /> {label}
    </Button>
  );
}
