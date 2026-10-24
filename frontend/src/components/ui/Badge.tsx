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
    "border border-white/10 bg-[#181A1F] text-white",
  slate:
    "border border-white/10 bg-white/5 text-white/80",
  blue:
    "border border-[#F2D74E]/30 bg-[#F2D74E]/10 text-[#F2D74E]",
  indigo:
    "border border-[#F2D74E]/30 bg-[#F2D74E]/10 text-[#F2D74E]",
  green:
    "border border-[#4ADE80]/30 bg-[#4ADE80]/10 text-[#4ADE80]",
  emerald:
    "border border-[#4ADE80]/30 bg-[#4ADE80]/10 text-[#4ADE80]",
  yellow:
    "border border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15]",
  amber:
    "border border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15]",
  red:
    "border border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]",
  rose:
    "border border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]",
  purple:
    "border border-white/15 bg-white/10 text-white",
};

const dotClasses: Record<BadgeVariant, string> = {
  default: "bg-white",
  slate: "bg-white/70",
  blue: "bg-[#F2D74E]",
  indigo: "bg-[#F2D74E]",
  green: "bg-[#4ADE80]",
  emerald: "bg-[#4ADE80]",
  yellow: "bg-[#FACC15]",
  amber: "bg-[#FACC15]",
  red: "bg-[#F87171]",
  rose: "bg-[#F87171]",
  purple: "bg-white",
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
