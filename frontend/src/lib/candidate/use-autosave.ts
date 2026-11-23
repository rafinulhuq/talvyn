"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AnswerMap } from "@/types/attempt";
import { toPayload } from "./answers";
import { attempts } from "./client";
import { markClean, putAnswer } from "./local-store";

const INTERVAL_MS = 10_000; // background flush
const DEBOUNCE_MS = 2_000; // after the last change

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/**
 * Two tiers: every change is written to IndexedDB immediately, and changed
 * answers are sent to the server in one bulk request (2s after typing stops,
 * every 10s, and when the connection returns). An answer stays "dirty" until
 * the server confirms the exact value that was sent.
 */
export function useAutosave({ attemptId, answers, enabled, pending = [] }: { attemptId: string; answers: AnswerMap; enabled: boolean; pending?: string[] }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const dirty = useRef(new Set(pending));
  const latest = useRef(answers);
  const inFlight = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Diff against the previous answers: changed ids become dirty and hit IndexedDB right away.
  useEffect(() => {
    const prev = latest.current;
    latest.current = answers;
    for (const [id, v] of Object.entries(answers)) {
      if (prev[id] !== v) {
        dirty.current.add(id);
        void putAnswer(attemptId, id, v, true);
      }
    }
  }, [answers, attemptId]);

  const flush = useCallback(async () => {
    if (!enabled || inFlight.current || dirty.current.size === 0) return;
    if (!navigator.onLine) {
      setFailed(true);
      return;
    }
    const sent = new Map<string, string>();
    for (const id of dirty.current) {
      const v = latest.current[id];
      if (v === undefined) dirty.current.delete(id);
      else sent.set(id, v);
    }
    if (!sent.size) return;
    inFlight.current = true;
    setSaving(true);
    const res = await attempts.bulkSave(attemptId, [...sent].map(([id, v]) => toPayload(id, v)));
    inFlight.current = false;
    setSaving(false);
    if (!res.ok) return setFailed(true);
    setFailed(false);
    setSavedAt(new Date());
    for (const [id, v] of sent) {
      // Only clear what didn't change while the request was in flight.
      if (latest.current[id] === v) {
        dirty.current.delete(id);
        void markClean(attemptId, id, v);
      }
    }
  }, [attemptId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const i = setInterval(() => void flush(), INTERVAL_MS);
    return () => clearInterval(i);
  }, [enabled, flush]);

  useEffect(() => {
    if (!enabled || dirty.current.size === 0) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => clearTimeout(debounce.current);
  }, [answers, enabled, flush]);

  useEffect(() => {
    if (online && enabled) {
      const t = setTimeout(() => void flush(), 0);
      return () => clearTimeout(t);
    }
  }, [online, enabled, flush]);

  const saveNow = useCallback(async () => {
    clearTimeout(debounce.current);
    // Wait out a request already in flight, then send whatever is left.
    for (let i = 0; i < 20 && inFlight.current; i++) await new Promise((r) => setTimeout(r, 100));
    await flush();
  }, [flush]);

  return { online, savedAt, saving, failed: failed || !online, saveNow };
}
