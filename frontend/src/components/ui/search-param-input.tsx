"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "./input";

/** Search box bound to ?q=. Debounced; resets to page 1 on change. */
export function SearchParamInput({ label, placeholder }: { label: string; placeholder?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function change(v: string) {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (v.trim()) next.set("q", v.trim());
      else next.delete("q");
      next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    }, 300);
  }

  return (
    <div className="relative w-full max-w-sm">
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
      <Input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => change(e.target.value)} className="pl-8" />
    </div>
  );
}
