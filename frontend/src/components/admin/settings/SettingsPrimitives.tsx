import type { ComponentType, ReactNode } from "react";
import { clsx } from "clsx";

export function SettingRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/8 bg-[#181A1F] p-3.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-white/80">{description}</p>
        )}
      </div>
      <span className="shrink-0 rounded-full border border-white/10 bg-[#121317] px-2.5 py-0.5 text-xs font-medium text-white">
        {value}
      </span>
    </div>
  );
}

export function Section({
  icon: Icon,
  title,
  children,
  accent = "brand",
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
  accent?: "brand" | "secondary";
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#121317] p-6 shadow-xs text-white">
      <div className="mb-5 flex items-center gap-2.5 border-b border-white/8 pb-3">
        <Icon className={clsx("h-4 w-4 text-[#F2D74E]", accent === "secondary" && "text-white/80")} />
        <h2 className="text-xs font-bold uppercase tracking-wider text-white">{title}</h2>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}
