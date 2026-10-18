"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseWebWorkerTimerOptions {
  durationSeconds: number;
  onExpire?: () => void;
  enabled?: boolean;
}

interface UseWebWorkerTimerReturn {
  remainingSeconds: number;
  formattedTime: string;
  isUrgent: boolean; // < 5 minutes
  isCritical: boolean; // < 1 minute
  isExpired: boolean;
  syncTime: (serverRemainingSeconds: number) => void;
}

export function useWebWorkerTimer({
  durationSeconds,
  onExpire,
  enabled = true,
}: UseWebWorkerTimerOptions): UseWebWorkerTimerReturn {
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);
  const workerRef = useRef<Worker | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const syncTime = useCallback((serverRemainingSeconds: number) => {
    setRemainingSeconds(serverRemainingSeconds);
    const targetEpochMs = Date.now() + serverRemainingSeconds * 1000;
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: "SYNC",
        payload: { targetEpochMs },
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const targetEpochMs = Date.now() + durationSeconds * 1000;

    if (typeof window !== "undefined" && window.Worker) {
      try {
        const worker = new Worker("/workers/examTimerWorker.js");
        workerRef.current = worker;

        worker.onmessage = (e) => {
          const { type, payload } = e.data;
          if (type === "TICK") {
            setRemainingSeconds(payload.remainingSeconds);
            if (payload.isExpired) {
              onExpireRef.current?.();
            }
          }
        };

        worker.postMessage({
          type: "START",
          payload: { targetEpochMs },
        });

        return () => {
          worker.postMessage({ type: "STOP" });
          worker.terminate();
          workerRef.current = null;
        };
      } catch (err) {
        console.warn("[useWebWorkerTimer] Worker init failed, using fallback interval:", err);
      }
    }

    // Fallback interval if Worker fails
    const interval = setInterval(() => {
      const remainingMs = Math.max(0, targetEpochMs - Date.now());
      const remaining = Math.ceil(remainingMs / 1000);
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpireRef.current?.();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [durationSeconds, enabled]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    remainingSeconds,
    formattedTime,
    isUrgent: remainingSeconds <= 300 && remainingSeconds > 60,
    isCritical: remainingSeconds <= 60 && remainingSeconds > 0,
    isExpired: remainingSeconds <= 0,
    syncTime,
  };
}
