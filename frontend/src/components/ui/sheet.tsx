"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Right-hand detail panel: opens a record without losing the list behind it. */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;

export function SheetContent({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-float animate-sheet-in focus:outline-none",
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="truncate text-lg font-medium text-ink">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-0.5 text-base text-ink-muted">{description}</DialogPrimitive.Description>
            )}
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <DialogPrimitive.Close className="grid size-7 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink">
              <X aria-hidden className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
