"use client";

import { useReportWebVitals } from "next/web-vitals";

const isEnabled = process.env.NEXT_PUBLIC_WEB_VITALS_ENABLED === "true";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!isEnabled) return;

    const body = JSON.stringify({
      id: metric.id,
      name: metric.name,
      rating: metric.rating,
      value: metric.value,
      delta: metric.delta,
      startTime: metric.startTime,
      navigationType: metric.navigationType,
      entryCount: metric.entries?.length ?? 0,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/observability/web-vitals",
        new Blob([body], { type: "application/json" })
      );
      return;
    }

    void fetch("/api/observability/web-vitals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  });

  return null;
}
