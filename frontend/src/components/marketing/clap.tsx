"use client";

import { HandHeart } from "lucide-react";
import { useState } from "react";

/** Reader appreciation. Each click sends one clap; the server keeps the count. */
export function ClapButton({ slug, initial }: { slug: string; initial: number }) {
  const [count, setCount] = useState(initial);
  const [mine, setMine] = useState(0);
  async function clap() {
    if (mine >= 50) return;
    setMine((m) => m + 1);
    setCount((c) => c + 1);
    const res = await fetch(`/api/public/api/v1/cmp/public/blog/${encodeURIComponent(slug)}/clap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 1 }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { claps?: number } | null;
    if (res?.ok && typeof body?.claps === "number") setCount(body.claps);
  }
  return (
    <button type="button" onClick={() => void clap()} className="inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-base text-ink hover:bg-sunken" aria-label={`Appreciate this post. ${count} so far.`}>
      <HandHeart aria-hidden className="size-4 text-accent" />
      <span className="tabular-nums" aria-hidden>
        {count}
      </span>
    </button>
  );
}
