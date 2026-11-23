"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "neutral" | "success" | "danger";
type ToastItem = { id: number; title: string; description?: string; tone: ToastTone };

// Tiny module-level store: toast() can be called from anywhere (handlers,
// mutations) without threading context through the tree.
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(input: { title: string; description?: string; tone?: ToastTone }) {
  items = [...items, { id: nextId++, tone: "neutral", ...input }];
  emit();
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: ToastItem[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {list.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          onOpenChange={(open) => !open && dismiss(t.id)}
          className="flex w-80 items-start gap-3 rounded-panel border border-line bg-surface p-3.5 shadow-float animate-pop-in"
        >
          {t.tone === "success" && <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />}
          {t.tone === "danger" && <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />}
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className={cn("text-base font-medium", t.tone === "danger" ? "text-danger" : "text-ink")}>
              {t.title}
            </ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="mt-0.5 text-sm text-ink-muted">{t.description}</ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close className="grid size-6 place-items-center rounded-control text-ink-faint hover:bg-sunken hover:text-ink">
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">Dismiss</span>
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
