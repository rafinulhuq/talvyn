/**
 * useTestTimer
 *
 * Server-authoritative countdown timer.
 *
 * - Counts down locally using setInterval (1s ticks)
 * - Syncs with the server every 30 seconds via heartbeat
 * - If server says force_submit or remaining reaches 0, calls onExpire()
 * - Tracks urgency: "normal" | "warning" (<5 min) | "critical" (<1 min)
 *
 * Usage:
 *   const { remaining, urgency, formatted } = useTestTimer({
 *     attemptId, initialSeconds, onExpire
 *   })
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { attemptsApi } from "@/lib/api/attempts";

type Urgency = "normal" | "warning" | "critical";

interface UseTestTimerOptions {
  attemptId: string;
  initialSeconds: number;
  onExpire: () => void;
  enabled?: boolean; // Set false to pause (e.g. on submission screen)
}

interface UseTestTimerReturn {
  remaining: number;
  urgency: Urgency;
  formatted: string; // "MM:SS"
  isExpired: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const TICK_INTERVAL_MS = 1_000;       // 1 second

export function useTestTimer({
  attemptId,
  initialSeconds,
  onExpire,
  enabled = true,
}: UseTestTimerOptions): UseTestTimerReturn {
  const [remaining, setRemaining] = useState(initialSeconds);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const remainingRef = useRef(initialSeconds);

  // Keep callback ref fresh without re-triggering effects
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // ── Resync when the server-provided initial value changes ───
  // The exam page mounts with initialSeconds=0 and only learns the real
  // value once getState() resolves, so the first render's useState seed is
  // stale by the time the timer actually starts ticking.
  const prevInitialSecondsRef = useRef(initialSeconds);
  useEffect(() => {
    if (initialSeconds !== prevInitialSecondsRef.current) {
      prevInitialSecondsRef.current = initialSeconds;
      remainingRef.current = initialSeconds;
      expiredRef.current = false;
      setRemaining(initialSeconds);
    }
  }, [initialSeconds]);

  // ── Countdown tick ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled || expiredRef.current) return;

    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled]);

  // Sync the ref and fire onExpire from a committed value change, not from
  // inside the updater above (which React may invoke more than once per tick).
  useEffect(() => {
    remainingRef.current = remaining;
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current();
    }
  }, [remaining]);

  // ── Heartbeat sync ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled || expiredRef.current) return;

    // Guards setRemaining()/onExpire() below against a heartbeat response
    // that resolves after this effect instance is gone (unmount, or
    // attemptId/enabled changed) — otherwise a stale response could fire
    // onExpire (and its submit/navigation side effects) for an attempt the
    // candidate has already left.
    let cancelled = false;

    const sync = async () => {
      if (expiredRef.current || cancelled) return;

      const result = await attemptsApi.heartbeat(attemptId, {
        client_time_remaining_seconds: remainingRef.current,
      });

      if (cancelled) return;
      if (!result) return; // Network error — keep running on client time

      if (result.force_submit || result.server_time_remaining_seconds <= 0) {
        if (!expiredRef.current) {
          expiredRef.current = true;
          setRemaining(0);
          onExpireRef.current();
        }
        return;
      }

      // Reconcile if drift > 30 seconds
      const drift = Math.abs(remainingRef.current - result.server_time_remaining_seconds);
      if (drift > 30) {
        setRemaining(result.server_time_remaining_seconds);
        remainingRef.current = result.server_time_remaining_seconds;
      }
    };

    const interval = setInterval(sync, HEARTBEAT_INTERVAL_MS);
    // Run immediately on mount to confirm timer is valid
    sync();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [attemptId, enabled]);

  // ── Derived values ─────────────────────────────────────────
  const urgency: Urgency =
    remaining <= 60 ? "critical" : remaining <= 300 ? "warning" : "normal";

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    remaining,
    urgency,
    formatted,
    isExpired: remaining === 0,
  };
}
