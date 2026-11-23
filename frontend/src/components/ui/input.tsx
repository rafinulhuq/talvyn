import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const controlBase = cn(
  "w-full rounded-control border border-line-strong bg-surface text-ink placeholder:text-ink-faint",
  "transition-colors duration-150 hover:border-ink-faint",
  "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25",
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/25",
);

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-9 px-3 text-base", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlBase, "min-h-24 px-3 py-2 text-base leading-relaxed", className)} {...props} />;
}
