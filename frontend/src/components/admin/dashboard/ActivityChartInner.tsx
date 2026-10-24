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
    <div className="rounded-xl border border-white/10 bg-[#181A1F] p-3 text-xs shadow-2xl text-white">
      <p className="mb-2 font-semibold text-white">
        {typeof label === "string" ? formatDate(label) : label}
      </p>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="capitalize text-white/80">{entry.name}</span>
            <span className="ml-auto font-display font-bold tabular-nums text-white">
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
            <stop offset="5%" stopColor="#F2D74E" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#F2D74E" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillEvaluated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4ADE80" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#4ADE80" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip content={ChartTooltip} cursor={{ stroke: "#F2D74E", strokeWidth: 1, strokeDasharray: "2 2" }} />
        <Area
          type="monotone"
          dataKey="invitations"
          stroke="rgba(255,255,255,0.4)"
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 1, stroke: "#FFFFFF" }}
        />
        <Area
          type="monotone"
          dataKey="submitted"
          stroke="#F2D74E"
          fill="url(#fillSubmitted)"
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 1, stroke: "#F2D74E" }}
        />
        <Area
          type="monotone"
          dataKey="evaluated"
          stroke="#4ADE80"
          fill="url(#fillEvaluated)"
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
