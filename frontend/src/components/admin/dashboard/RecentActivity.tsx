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
  success: { icon: CheckCircle2, classes: "bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80]" },
  warning: { icon: Clock, classes: "bg-[#FACC15]/10 border border-[#FACC15]/30 text-[#FACC15]" },
  info: { icon: Info, classes: "border border-white/10 bg-white/5 text-white/80" },
  danger: { icon: AlertTriangle, classes: "bg-[#F87171]/10 border border-[#F87171]/30 text-[#F87171]" },
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
                ? "bg-[#F2D74E] text-[#1A1600] font-semibold shadow-xs"
                : "border border-transparent text-white/80 hover:bg-white/5 hover:text-white"
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
                ? "bg-[#F2D74E] text-[#1A1600] font-semibold shadow-xs"
                : "border border-transparent text-white/80 hover:bg-white/5 hover:text-white"
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
                ? "bg-[#F2D74E] text-[#1A1600] font-semibold shadow-xs"
                : "border border-transparent text-white/80 hover:bg-white/5 hover:text-white"
            )}
          >
            Audit Log
          </button>
        </div>
        <span className="text-xs text-white/80">
          {filteredEvents.length} items
        </span>
      </div>

      {filteredEvents.length === 0 ? (
        <p className="py-8 text-center text-xs text-white/80">No activity recorded for this view.</p>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
          {filteredEvents.map((event) => {
            const { icon: Icon, classes } = STATUS_STYLE[event.status];
            const isAssessment = event.id.startsWith("completion-");
            return (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-xl border border-white/8 bg-[#181A1F] p-3 shadow-xs transition-colors hover:border-white/15"
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
                    <p className="truncate text-xs font-semibold text-white">
                      {event.title}
                    </p>
                    {isAssessment && (
                      <span className="rounded-full bg-[#F2D74E]/10 border border-[#F2D74E]/30 px-1.5 py-0.2 text-[9px] font-semibold text-[#F2D74E]">
                        Candidate
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-white/80">
                    {event.subtitle}
                  </p>
                </div>
                <div className="shrink-0 pt-0.5 text-right">
                  <p className="text-[10px] text-white/70">{formatTime(event.time)}</p>
                  <p className="truncate text-[11px] font-medium text-white">{event.actor}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

