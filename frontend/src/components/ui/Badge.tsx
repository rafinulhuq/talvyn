import { clsx } from "clsx";
import type { ComponentType } from "react";

export type BadgeVariant =
  | "default"
  | "blue"
  | "indigo"
  | "green"
  | "emerald"
  | "yellow"
  | "amber"
  | "red"
  | "rose"
  | "slate"
  | "purple";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
  icon?: ComponentType<{ className?: string }>;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border border-slate-200 bg-slate-100 text-slate-700",
  slate:
    "border border-slate-200 bg-slate-100 text-slate-600",
  blue:
    "border border-indigo-200 bg-indigo-50 text-indigo-700",
  indigo:
    "border border-indigo-200 bg-indigo-50 text-indigo-700",
  green:
    "border border-emerald-200 bg-emerald-50 text-emerald-700",
  emerald:
    "border border-emerald-200 bg-emerald-50 text-emerald-700",
  yellow:
    "border border-amber-200 bg-amber-50 text-amber-700",
  amber:
    "border border-amber-200 bg-amber-50 text-amber-700",
  red:
    "border border-rose-200 bg-rose-50 text-rose-700",
  rose:
    "border border-rose-200 bg-rose-50 text-rose-700",
  purple:
    "border border-purple-200 bg-purple-50 text-purple-700",
};

const dotClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-500",
  slate: "bg-slate-400",
  blue: "bg-indigo-600",
  indigo: "bg-indigo-600",
  green: "bg-emerald-600",
  emerald: "bg-emerald-600",
  yellow: "bg-amber-600",
  amber: "bg-amber-600",
  red: "bg-rose-600",
  rose: "bg-rose-600",
  purple: "bg-purple-600",
};

export function Badge({
  children,
  variant = "default",
  className,
  dot = false,
  icon: Icon,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "font-sans text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {Icon ? (
        <Icon className="h-3 w-3 shrink-0" />
      ) : (
        dot && (
          <span
            className={clsx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              dotClasses[variant]
            )}
          />
        )
      )}
      {children}
    </span>
  );
}
