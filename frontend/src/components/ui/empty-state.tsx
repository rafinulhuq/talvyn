import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Empty screens invite the next action — say what's missing and how to add it. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 px-6 py-10", className)}>
      {Icon && (
        <span className="grid size-9 place-items-center rounded-panel border border-line bg-surface text-ink-muted">
          <Icon aria-hidden className="size-4.5" />
        </span>
      )}
      <div className="max-w-md">
        <h2 className="text-md font-medium text-ink">{title}</h2>
        {description && <p className="mt-1 text-base text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
