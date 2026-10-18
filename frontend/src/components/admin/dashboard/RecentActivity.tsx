"use client";

/**
 * Recent activity table for the dashboard with category filtering
 * (All vs Candidate Assessments vs Audit Log).
 */

import { useState } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, CheckCircle2, Clock, Info, ShieldCheck, UserCheck } from "lucide-react";
import { clsx } from "clsx";

export interface ActivityEvent {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  actor: string;
  status: "success" | "warning" | "info" | "danger";
}

interface RecentActivityProps {
  events: ActivityEvent[];
}

const STATUS_STYLE: Record<
  ActivityEvent["status"],
  { icon: ComponentType<{ className?: string }>; classes: string }
> = {
  success: { icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  warning: { icon: Clock, classes: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  info: { icon: Info, classes: "border border-zinc-300 dark:border-zinc-700 bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" },
  danger: { icon: AlertTriangle, classes: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RecentActivity({ events }: RecentActivityProps) {
  const [filter, setFilter] = useState<"all" | "assessments" | "audit">("all");

  const filteredEvents = events.filter((event) => {
    if (filter === "assessments") {
      return event.id.startsWith("completion-");
    }
    if (filter === "audit") {
      return event.id.startsWith("audit-");
    }
    return true;
  });

  return (
    <div>
      {/* Category Filter Pills */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
              filter === "all"
                ? "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/80 shadow-xs dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900"
                : "border border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("assessments")}
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
              filter === "assessments"
                ? "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/80 shadow-xs dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900"
                : "border border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            Assessments
          </button>
          <button
            type="button"
            onClick={() => setFilter("audit")}
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
              filter === "audit"
                ? "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/80 shadow-xs dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900"
                : "border border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            Audit Log
          </button>
        </div>
        <span className="text-xs text-slate-400">
          {filteredEvents.length} items
        </span>
      </div>

      {filteredEvents.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No activity recorded for this view.</p>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
          {filteredEvents.map((event) => {
            const { icon: Icon, classes } = STATUS_STYLE[event.status];
            const isAssessment = event.id.startsWith("completion-");
            return (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-colors hover:border-slate-300"
              >
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    classes
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {event.title}
                    </p>
                    {isAssessment && (
                      <span className="rounded-full bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 text-[9px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300">
                        Candidate
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {event.subtitle}
                  </p>
                </div>
                <div className="shrink-0 pt-0.5 text-right">
                  <p className="text-[10px] text-slate-400">{formatTime(event.time)}</p>
                  <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">{event.actor}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

