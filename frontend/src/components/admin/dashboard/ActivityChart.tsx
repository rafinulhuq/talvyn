/**
 * Assessment activity chart — daily invitations / starts / submissions /
 * evaluations over the trailing window. The parent server component supplies
 * the already-fetched points.
 *
 * recharts is a heavy library and only needed once this component actually
 * renders, so the real implementation (ActivityChartInner) is loaded via
 * next/dynamic — pages that never render a chart never download it.
 */

"use client";

import dynamic from "next/dynamic";

export interface ActivityPoint {
  date: string;
  invitations: number;
  started: number;
  submitted: number;
  evaluated: number;
}

interface ActivityChartProps {
  points: ActivityPoint[];
}

const ActivityChartInner = dynamic(() => import("./ActivityChartInner"), {
  ssr: false,
  loading: () => <div className="h-[272px]" />,
});

export function ActivityChart({ points }: ActivityChartProps) {
  return <ActivityChartInner points={points} />;
}
