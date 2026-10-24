import { clsx } from "clsx";
import { ChevronDown, GripVertical } from "lucide-react";
import type { DragEvent, ReactNode } from "react";

export function SectionCard({
  title,
  description,
  children,
  toolbar,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  collapsible = false,
  expanded = true,
  onToggle,
  edited = false,
  anchorId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  toolbar?: ReactNode;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  edited?: boolean;
  anchorId?: string;
}) {
  const open = !collapsible || expanded;
  return (
    <section
      id={anchorId}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="scroll-mt-28 rounded-2xl bg-slate-100 dark:bg-slate-800/60"
    >
      <div
        className={clsx(
          "flex flex-wrap items-start justify-between gap-3 px-4 py-3",
          open && "border-b border-slate-200/80 dark:border-slate-700/60",
          collapsible && "cursor-pointer select-none"
        )}
        onClick={collapsible ? onToggle : undefined}
      >
        <div className="flex min-w-0 items-start gap-3">
          {draggable && (
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg bg-white text-slate-400 dark:bg-slate-900 dark:text-slate-500 active:cursor-grabbing"
              onClick={(event) => event.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
              {title}
              {edited && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                  title="Has unpublished edits"
                />
              )}
            </h3>
            {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          {toolbar}
          {collapsible && (
            <button
              type="button"
              aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
              aria-expanded={open}
              onClick={onToggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      {open && <div className="space-y-4 p-4">{children}</div>}
    </section>
  );
}
