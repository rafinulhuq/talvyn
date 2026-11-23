import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-line-strong hover:border-ink-faint hover:bg-sunken",
  ghost: "text-ink-muted hover:text-ink hover:bg-sunken",
  danger: "bg-danger text-white hover:opacity-90 dark:text-canvas",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-sm gap-1.5",
  md: "h-9 px-3.5 text-base gap-2",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button; keep the label (it says what's happening). */
  loading?: boolean;
  /** Render the child element (e.g. a Link) with button styling. */
  asChild?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  asChild = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-medium",
    "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
  if (asChild) {
    return <Slot className={classes} {...props}>{children}</Slot>;
  }
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}
