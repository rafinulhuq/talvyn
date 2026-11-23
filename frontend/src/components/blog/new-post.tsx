"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";

/** Creates an empty draft and opens it. */
export function NewPostButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await api<{ id: string }>("/api/v1/cmp/blog", { method: "POST", body: { title: "Untitled post", content_md: "" } });
    setBusy(false);
    if (!res.ok) return toast({ title: "Couldn't create a post", description: res.error.message, tone: "danger" });
    router.push(`/dashboard/cmp/blog/${res.data.id}`);
  }
  return (
    <Button variant="primary" loading={busy} onClick={() => void create()}>
      <Plus aria-hidden className="size-4" /> New post
    </Button>
  );
}
