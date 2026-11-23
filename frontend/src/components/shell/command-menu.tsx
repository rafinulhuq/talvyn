"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Briefcase, ClipboardCheck, FileText, FileUp, Loader2, LogOut, Monitor, Moon, Sun, UserRound, type LucideIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { api } from "@/lib/api/client";
import { navFor } from "./nav";
import { useShell } from "./shell-context";

type SearchResult = { kind: string; title: string; subtitle: string | null; href: string; meta: string | null };

const KIND_ICON: Record<string, LucideIcon> = { candidate: UserRound, jd: Briefcase, test: FileText, result: ClipboardCheck };
const KIND_LABEL: Record<string, string> = { candidate: "Candidates", jd: "Job descriptions", test: "Tests", result: "Results" };

// Results come from the backend; only follow in-app dashboard links.
const safeHref = (href: string) => href.startsWith("/dashboard") && !href.startsWith("//");

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { user } = useShell();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [fetched, setFetched] = useState<{ q: string; items: SearchResult[] }>({ q: "", items: [] });
  const q = useDebounced(query.trim(), 200);

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    void api<{ items: SearchResult[] }>(`/api/v1/search?${new URLSearchParams({ query: q, limit_per_group: "5" })}`).then((res) => {
      if (!cancelled) setFetched({ q, items: res.ok ? res.data.items.filter((r) => safeHref(r.href)) : [] });
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  // Derived: results belong to the current debounced query or are stale.
  const results = useMemo(() => (q.length >= 2 && fetched.q === q ? fetched.items : []), [q, fetched]);
  const loading = q.length >= 2 && fetched.q !== q;

  const setOpen = (o: boolean) => {
    if (!o) setQuery("");
    onOpenChange(o);
  };
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const lower = query.trim().toLowerCase();
  const nav = useMemo(
    () => navFor(user.role).flatMap((g) => g.items).filter((i) => !lower || i.label.toLowerCase().includes(lower)),
    [user.role, lower],
  );
  const grouped = useMemo(() => {
    const m = new Map<string, SearchResult[]>();
    for (const r of results) m.set(r.kind, [...(m.get(r.kind) ?? []), r]);
    return [...m.entries()];
  }, [results]);

  const actions = [
    { label: "Upload a job description", icon: FileUp, go: () => router.push("/dashboard/jds/upload") },
    { label: "Switch to light theme", icon: Sun, go: () => setTheme("light") },
    { label: "Switch to dark theme", icon: Moon, go: () => setTheme("dark") },
    { label: "Match system theme", icon: Monitor, go: () => setTheme("system") },
    { label: "Sign out", icon: LogOut, go: () => void signOut({ callbackUrl: "/login" }) },
  ].filter((a) => !lower || a.label.toLowerCase().includes(lower));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-panel border border-line shadow-float animate-pop-in"
        >
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <Command shouldFilter={false} loop>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search candidates, roles and tests, or type a command" />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-ink-muted">
                  <Loader2 aria-hidden className="size-3.5 animate-spin" /> Searching
                </div>
              )}
              <CommandEmpty>{q.length >= 2 && !loading ? `No matches for "${q}".` : "Type to search."}</CommandEmpty>
              {grouped.map(([kind, items]) => (
                <CommandGroup key={kind} heading={KIND_LABEL[kind] ?? "Results"}>
                  {items.map((r) => {
                    const Icon = KIND_ICON[r.kind] ?? FileText;
                    return (
                      <CommandItem key={r.href} value={`${r.kind}:${r.href}`} onSelect={() => run(() => router.push(r.href))}>
                        <Icon aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {r.title}
                          {r.subtitle && <span className="ml-2 text-ink-muted">{r.subtitle}</span>}
                        </span>
                        {r.meta && <span className="text-sm text-ink-muted">{r.meta}</span>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
              {nav.length > 0 && (
                <CommandGroup heading="Go to">
                  {nav.map((i) => (
                    <CommandItem key={i.href} value={`nav:${i.href}`} onSelect={() => run(() => router.push(i.href))}>
                      <i.icon aria-hidden />
                      <span className="flex-1">{i.label}</span>
                      {i.key && (
                        <span className="flex gap-0.5" aria-label={`Shortcut G then ${i.key.toUpperCase()}`}>
                          <Kbd>G</Kbd>
                          <Kbd>{i.key.toUpperCase()}</Kbd>
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {actions.length > 0 && (
                <CommandGroup heading="Actions">
                  {actions.map((a) => (
                    <CommandItem key={a.label} value={`action:${a.label}`} onSelect={() => run(a.go)}>
                      <a.icon aria-hidden /> {a.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
