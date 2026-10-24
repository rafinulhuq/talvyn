import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { clsx } from "clsx";

interface ErrorStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title,
  description,
  icon,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-4 rounded-xl border border-[#F87171]/20 bg-[#121317] py-14 px-6 text-center shadow-xs",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F87171]/10 border border-[#F87171]/30 text-[#F87171]">
        {icon ?? <AlertTriangle className="h-6 w-6" />}
      </div>
      <div className="max-w-md">
        <p className="font-display text-sm font-semibold text-white">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-white/80 leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
