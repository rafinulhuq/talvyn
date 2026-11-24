"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { createContext, useContext, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlBase } from "./input";

type ControlA11y = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean };
const ControlContext = createContext<ControlA11y>({});

/**
 * Radix's Root renders no element, so the id/aria props that <Field> injects
 * would be dropped. Pass them through to the trigger, where the label points.
 */
export function Select({ id, "aria-describedby": describedBy, "aria-invalid": invalid, ...props }: ComponentProps<typeof SelectPrimitive.Root> & ControlA11y) {
  return (
    <ControlContext.Provider value={{ id, "aria-describedby": describedBy, "aria-invalid": invalid }}>
      <SelectPrimitive.Root {...props} />
    </ControlContext.Provider>
  );
}
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  const a11y = useContext(ControlContext);
  return (
    <SelectPrimitive.Trigger
      id={a11y.id}
      aria-describedby={a11y["aria-describedby"]}
      aria-invalid={a11y["aria-invalid"]}
      className={cn(controlBase, "flex h-9 items-center justify-between gap-2 px-3 text-left text-base data-[placeholder]:text-ink-faint", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown aria-hidden className="size-4 text-ink-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          "z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-menu border border-line bg-surface p-1 shadow-float animate-pop-in",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex h-8 cursor-default select-none items-center rounded-control pl-8 pr-3 text-base text-ink outline-none",
        "data-[highlighted]:bg-sunken data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2.5 inline-flex">
        <Check aria-hidden className="size-3.5 text-accent" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
