"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { navFor } from "./nav";
import { useShell } from "./shell-context";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Global keys: ⌘K / Ctrl K opens search, "G then <key>" navigates, "?" lists shortcuts. */
export function useGlobalShortcuts(openCommand: () => void, toggleCommand: () => void) {
  const router = useRouter();
  const { user } = useShell();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const items = navFor(user.role).flatMap((g) => g.items).filter((i) => i.key);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommand();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        openCommand();
      } else if (e.key === "?") {
        setHelpOpen(true);
      } else if (e.key.toLowerCase() === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1000);
      } else if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const target = items.find((i) => i.key === e.key.toLowerCase());
        if (target) router.push(target.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, user.role, openCommand, toggleCommand]);

  return { helpOpen, setHelpOpen };
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useShell();
  const nav = navFor(user.role).flatMap((g) => g.items).filter((i) => i.key);
  const rows: [string, string[]][] = [
    ["Search and commands", ["⌘", "K"]],
    ["Search (alternative)", ["/"]],
    ["Show keyboard shortcuts", ["?"]],
    ...nav.map((i): [string, string[]] => [`Go to ${i.label.toLowerCase()}`, ["G", (i.key ?? "").toUpperCase()]]),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Keyboard shortcuts" description="Shortcuts don't fire while you're typing in a field. On Windows and Linux, use Ctrl instead of ⌘.">
        <dl className="flex flex-col divide-y divide-line">
          {rows.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <dt className="text-base text-ink">{label}</dt>
              <dd className="flex gap-1">
                {keys.map((k, i) => (
                  <Kbd key={`${k}-${i}`}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
