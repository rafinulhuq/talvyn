import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: { cls: "border-line bg-sunken text-ink", icon: Info, iconCls: "text-ink-muted" },
  success: { cls: "border-success/30 bg-success-soft text-ink", icon: CheckCircle2, iconCls: "text-success" },
  danger: { cls: "border-danger/30 bg-danger-soft text-ink", icon: CircleAlert, iconCls: "text-danger" },
} as const;

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof tones; title?: string; children?: ReactNode; className?: string }) {
  const t = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-panel border p-3", t.cls, className)}>
      <t.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.iconCls)} />
      <div className="text-base">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink-muted")}>{children}</div>}
      </div>
    </div>
  );
}
