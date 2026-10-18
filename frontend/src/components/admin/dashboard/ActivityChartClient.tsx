"use client";

import dynamic from "next/dynamic";
import type { ActivityPoint } from "./ActivityChart";

const ActivityChart = dynamic(
  () => import("./ActivityChart").then((mod) => mod.ActivityChart),
  {
    ssr: false,
    loading: () => <ActivityChartSkeleton />,
  }
);

function ActivityChartSkeleton() {
  return (
    <div
      className="flex h-[272px] w-full animate-pulse items-center justify-center rounded-xl bg-white dark:bg-slate-900"
      aria-hidden="true"
    >
      <div className="h-24 w-5/6 rounded-lg bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

export function ActivityChartClient({ points }: { points: ActivityPoint[] }) {
  return <ActivityChart points={points} />;
}
