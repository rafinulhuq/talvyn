"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { attemptsApi } from "@/lib/api/attempts";
import { saveLocalAnswer, markAnswerClean } from "@/lib/storage/candidateIndexedDb";
import type { LocalAnswerMap, SaveAnswerRequest } from "@/types/attempt";

const AUTO_SAVE_INTERVAL_MS = 10_000; // 10 seconds
const DEBOUNCE_DELAY_MS = 2_000;      // 2 seconds after last keystroke

interface UseAutoSaveOptions {
  attemptId: string;
  answers: LocalAnswerMap;
  enabled?: boolean;
}

interface UseAutoSaveReturn {
  lastSavedAt: Date | null;
  isSaving: boolean;
  saveError: boolean;
  isOnline: boolean;
  saveNow: () => Promise<void>;
}

export function useAutoSave({
  attemptId,
  answers,
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  const dirtyRef = useRef<Set<string>>(new Set());
  const answersRef = useRef(answers);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  // Keep answers ref current and commit to IndexedDB on every change (0ms write)
  useEffect(() => {
    const prevAnswers = answersRef.current;
    answersRef.current = answers;

    for (const [qId, value] of Object.entries(answers)) {
      if (prevAnswers[qId] !== value) {
        dirtyRef.current.add(qId);
        void saveLocalAnswer(attemptId, qId, value, true);
      }
    }
  }, [answers, attemptId]);

  const flushDirty = useCallback(async (): Promise<void> => {
    if (!enabled || inFlightRef.current || dirtyRef.current.size === 0) return;

    if (!isOnline) {
      setSaveError(true);
      return;
    }

    const toSave = [...dirtyRef.current];

    const snapshot = new Map<string, string>();
    const payloadAnswers: SaveAnswerRequest[] = [];
    for (const qId of toSave) {
      const value = answersRef.current[qId];
      if (value === undefined) {
        dirtyRef.current.delete(qId);
        continue;
      }
      snapshot.set(qId, value);
      const isOption = ["A", "B", "C", "D"].includes(value);
      payloadAnswers.push({
        question_id: qId,
        selected_option: isOption ? (value as "A" | "B" | "C" | "D") : null,
        answer_text: isOption ? null : value || null,
      });
    }

    if (payloadAnswers.length === 0) return;

    inFlightRef.current = true;
    setIsSaving(true);
    try {
      const result = await attemptsApi.bulkSave(attemptId, { answers: payloadAnswers });

      if (result === null) {
        setSaveError(true);
        return;
      }

      setSaveError(false);
      setLastSavedAt(new Date());

      for (const [qId, savedValue] of snapshot) {
        if (answersRef.current[qId] === savedValue) {
          dirtyRef.current.delete(qId);
          void markAnswerClean(attemptId, qId);
        }
      }
    } finally {
      setIsSaving(false);
      inFlightRef.current = false;
    }
  }, [attemptId, enabled, isOnline]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
      setSaveError(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline) void flushDirty();
  }, [isOnline, flushDirty]);

  // Interval save
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(flushDirty, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [flushDirty, enabled]);

  // Debounced save
  useEffect(() => {
    if (!enabled || dirtyRef.current.size === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(flushDirty, DEBOUNCE_DELAY_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [answers, flushDirty, enabled]);

  // Manual flush
  const saveNow = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await flushDirty();
  }, [flushDirty]);

  return { lastSavedAt, isSaving, saveError, isOnline, saveNow };
}
