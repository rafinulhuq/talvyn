import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-muted",
  accent: "bg-accent-soft text-accent-soft-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/** Status label. `dot` adds a leading status mark for at-a-glance scanning in tables. */
export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1.5 rounded-control px-1.5 text-xs font-medium", tones[tone], className)}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
