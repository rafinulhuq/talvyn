"use client";

import { useEffect, useRef, useState } from "react";
import { attempts } from "./client";

const TICK_MS = 500;
const HEARTBEAT_MS = 30_000;
const MAX_DRIFT_S = 30;

/**
 * Server-authoritative countdown. Counts down against a fixed deadline
 * (so a throttled or slow tick never drifts), sends a heartbeat every 30s,
 * and expires when the deadline passes or the server says force_submit.
 * If client and server disagree by more than 30s, the server wins.
 * Mount once per attempt (key the component by attempt id).
 */
export function useExamTimer({ attemptId, initialSeconds, enabled, onExpire }: { attemptId: string; initialSeconds: number; enabled: boolean; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const deadline = useRef(0); // set when the timer first runs (no clock reads during render)
  const expired = useRef(false);
  const expireCb = useRef(onExpire);
  useEffect(() => {
    expireCb.current = onExpire;
  });

  useEffect(() => {
    if (!enabled) return;
    if (deadline.current === 0) deadline.current = Date.now() + initialSeconds * 1000;
    const fire = () => {
      if (expired.current) return;
      expired.current = true;
      setRemaining(0);
      expireCb.current();
    };
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) fire();
    };
    let cancelled = false;
    const beat = async () => {
      if (expired.current) return;
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      const res = await attempts.heartbeat(attemptId, left);
      if (cancelled || !res.ok) return; // offline: keep counting on the client
      if (res.data.force_submit || res.data.server_time_remaining_seconds <= 0) return fire();
      if (Math.abs(left - res.data.server_time_remaining_seconds) > MAX_DRIFT_S) {
        deadline.current = Date.now() + res.data.server_time_remaining_seconds * 1000;
        tick();
      }
    };
    const t = setInterval(tick, TICK_MS);
    const h = setInterval(() => void beat(), HEARTBEAT_MS);
    void beat();
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(h);
    };
  }, [attemptId, enabled, initialSeconds]);

  return remaining;
}
