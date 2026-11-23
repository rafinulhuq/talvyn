"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MODES = [
  { id: "one", label: "One person" },
  { id: "list", label: "A list" },
  { id: "link", label: "Public link" },
] as const;

/** Mode lives in the URL (?mode=) so a reload or shared link opens the same tab. */
export function InviteTabs({ panels }: { panels: Record<(typeof MODES)[number]["id"], ReactNode> }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode = MODES.some((m) => m.id === raw) ? (raw as string) : "one";
  return (
    <Tabs value={mode} onValueChange={(v) => router.replace(`${path}?mode=${v}`, { scroll: false })}>
      <TabsList>
        {MODES.map((m) => (
          <TabsTrigger key={m.id} value={m.id}>
            {m.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {MODES.map((m) => (
        <TabsContent key={m.id} value={m.id}>
          {panels[m.id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
