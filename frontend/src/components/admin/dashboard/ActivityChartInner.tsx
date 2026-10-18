/**
 * Actual recharts implementation for ActivityChart, loaded lazily via
 * next/dynamic from ActivityChart.tsx so recharts never ships in the
 * initial bundle for pages that don't render this chart.
 */

"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import type { ActivityPoint } from "./ActivityChart";

interface ActivityChartProps {
  points: ActivityPoint[];
}

function formatDate(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
        {typeof label === "string" ? formatDate(label) : label}
      </p>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="capitalize text-slate-500 dark:text-slate-400">{entry.name}</span>
            <span className="ml-auto font-display font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ActivityChartInner({ points }: ActivityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={272}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="fillSubmitted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillEvaluated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip content={ChartTooltip} cursor={{ stroke: "#4f46e5", strokeWidth: 1, strokeDasharray: "2 2" }} />
        <Area
          type="monotone"
          dataKey="invitations"
          stroke="#94a3b8"
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 1, stroke: "#64748b" }}
        />
        <Area
          type="monotone"
          dataKey="submitted"
          stroke="#4f46e5"
          fill="url(#fillSubmitted)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 1, stroke: "#4338ca" }}
        />
        <Area
          type="monotone"
          dataKey="evaluated"
          stroke="#0284c7"
          fill="url(#fillEvaluated)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
