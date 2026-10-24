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
    border: "border-white/10",
    bg: "bg-[#181A1F]",
    icon: "text-[#F2D74E]",
    title: "text-white font-semibold",
    desc: "text-white/80",
  },
  success: {
    border: "border-[#4ADE80]/30",
    bg: "bg-[#4ADE80]/10",
    icon: "text-[#4ADE80]",
    title: "text-white font-semibold",
    desc: "text-[#4ADE80]",
  },
  warning: {
    border: "border-[#FACC15]/30",
    bg: "bg-[#FACC15]/10",
    icon: "text-[#FACC15]",
    title: "text-white font-semibold",
    desc: "text-[#FACC15]",
  },
  danger: {
    border: "border-[#F87171]/30",
    bg: "bg-[#F87171]/10",
    icon: "text-[#F87171]",
    title: "text-white font-semibold",
    desc: "text-[#F87171]",
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
