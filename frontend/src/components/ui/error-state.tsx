import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** A section or page that failed to load. Says what happened; offers the next step. */
export function ErrorState({ title = "This didn't load", message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface px-6 py-8">
      <span className="grid size-9 place-items-center rounded-panel border border-danger/30 bg-danger-soft text-danger">
        <CircleAlert aria-hidden className="size-4.5" />
      </span>
      <div>
        <h2 className="text-md font-medium text-ink">{title}</h2>
        <p className="mt-1 max-w-md text-base text-ink-muted">{message}</p>
      </div>
      {action}
    </div>
  );
}
