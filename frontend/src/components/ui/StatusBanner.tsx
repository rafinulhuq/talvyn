import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { clsx } from "clsx";

export type StatusBannerVariant = "info" | "success" | "warning" | "danger";

interface StatusBannerProps {
  variant: StatusBannerVariant;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  pulse?: boolean;
  className?: string;
}

const styles: Record<
  StatusBannerVariant,
  { border: string; bg: string; icon: string; title: string; desc: string }
> = {
  info: {
    border: "border-indigo-200 dark:border-indigo-800/60",
    bg: "bg-indigo-50/70 dark:bg-indigo-950/30",
    icon: "text-indigo-600 dark:text-indigo-400",
    title: "text-indigo-900 dark:text-indigo-200 font-semibold",
    desc: "text-indigo-700 dark:text-indigo-300",
  },
  success: {
    border: "border-emerald-200 dark:border-emerald-800/60",
    bg: "bg-emerald-50/70 dark:bg-emerald-950/30",
    icon: "text-emerald-600 dark:text-emerald-400",
    title: "text-emerald-900 dark:text-emerald-200 font-semibold",
    desc: "text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    border: "border-amber-200 dark:border-amber-800/60",
    bg: "bg-amber-50/70 dark:bg-amber-950/30",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-900 dark:text-amber-200 font-semibold",
    desc: "text-amber-800 dark:text-amber-300",
  },
  danger: {
    border: "border-rose-200 dark:border-rose-800/60",
    bg: "bg-rose-50/70 dark:bg-rose-950/30",
    icon: "text-rose-600 dark:text-rose-400",
    title: "text-rose-900 dark:text-rose-200 font-semibold",
    desc: "text-rose-700 dark:text-rose-300",
  },
};

const defaultIcons: Record<StatusBannerVariant, ReactNode> = {
  info: <Info className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  warning: <AlertCircle className="h-4 w-4" />,
  danger: <AlertTriangle className="h-4 w-4" />,
};

export function StatusBanner({
  variant,
  title,
  description,
  icon,
  pulse = false,
  className,
}: StatusBannerProps) {
  const s = styles[variant];
  return (
    <div
      className={clsx(
        "flex items-start gap-3 rounded-xl border p-4 shadow-2xs backdrop-blur-xs transition-all",
        s.border,
        s.bg,
        className
      )}
    >
      <span className={clsx("mt-0.5 shrink-0", s.icon, pulse && "animate-pulse")}>
        {icon ?? defaultIcons[variant]}
      </span>
      <div className="min-w-0 flex-1">
        <p className={clsx("text-sm", s.title)}>{title}</p>
        {description && (
          <div className={clsx("mt-1 text-xs leading-relaxed", s.desc)}>
            {description}
          </div>
        )}
      </div>
    </div>
  );
}
