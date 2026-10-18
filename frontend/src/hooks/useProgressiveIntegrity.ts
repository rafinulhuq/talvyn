"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { attemptsApi } from "@/lib/api/attempts";
import type { SuspiciousEventType } from "@/types/attempt";

interface UseProgressiveIntegrityOptions {
  attemptId: string;
  enabled?: boolean;
  onTerminalViolation?: (type: SuspiciousEventType) => void;
  onNotice?: (message: string) => void;
}

export interface IntegrityState {
  strikes: number;
  maxStrikes: number;
  strikeModalOpen: boolean;
  strikeNotice: string | null;
  graceSecondsRemaining: number;
  acknowledgeStrike: () => void;
}

export function useProgressiveIntegrity({
  attemptId,
  enabled = true,
  onTerminalViolation,
  onNotice,
}: UseProgressiveIntegrityOptions): IntegrityState {
  const [strikes, setStrikes] = useState(0);
  const [strikeModalOpen, setStrikeModalOpen] = useState(false);
  const [strikeNotice, setStrikeNotice] = useState<string | null>(null);
  const [graceSecondsRemaining, setGraceSecondsRemaining] = useState(0);

  const strikesRef = useRef(0);
  strikesRef.current = strikes;

  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blurStartEpochRef = useRef<number | null>(null);

  const registerStrike = useCallback(
    (type: SuspiciousEventType, durationAwaySec = 0) => {
      const nextStrikes = strikesRef.current + 1;
      setStrikes(nextStrikes);

      void attemptsApi.logEvent(attemptId, {
        event_type: type,
        metadata: {
          strikeNumber: nextStrikes,
          durationAwaySec,
          timestamp: Date.now(),
        },
      });

      if (nextStrikes >= 3) {
        onTerminalViolation?.(type);
      } else if (nextStrikes === 2) {
        setStrikeModalOpen(true);
        setStrikeNotice(
          "Strike 2: You navigated away from the assessment. One more violation will immediately terminate your session."
        );
      } else if (nextStrikes === 1) {
        setStrikeNotice(
          "Warning (Strike 1 of 3): Please maintain focus on the exam window. Suspicious navigation events are recorded."
        );
        setTimeout(() => setStrikeNotice(null), 8000);
      }
    },
    [attemptId, onTerminalViolation]
  );

  const acknowledgeStrike = useCallback(() => {
    setStrikeModalOpen(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleFocusLoss = () => {
      blurStartEpochRef.current = Date.now();

      // Grace period of 3 seconds before counting a departure
      blurTimerRef.current = setTimeout(() => {
        let grace = 10;
        setGraceSecondsRemaining(grace);

        graceIntervalRef.current = setInterval(() => {
          grace -= 1;
          setGraceSecondsRemaining(grace);
          if (grace <= 0) {
            if (graceIntervalRef.current) clearInterval(graceIntervalRef.current);
            const duration = Math.round((Date.now() - (blurStartEpochRef.current ?? Date.now())) / 1000);
            registerStrike("WINDOW_BLUR", duration);
          }
        }, 1000);
      }, 3000);
    };

    const handleFocusGain = () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      if (graceIntervalRef.current) {
        clearInterval(graceIntervalRef.current);
        graceIntervalRef.current = null;
      }
      setGraceSecondsRemaining(0);
      blurStartEpochRef.current = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleFocusLoss();
      } else {
        handleFocusGain();
      }
    };

    const handleClipboardDeterrent = (e: ClipboardEvent, type: SuspiciousEventType) => {
      e.preventDefault();
      onNotice?.("Clipboard operations (copy/paste) are restricted during this assessment.");
      void attemptsApi.logEvent(attemptId, { event_type: type });
    };

    const onCopy = (e: ClipboardEvent) => handleClipboardDeterrent(e, "COPY_ATTEMPT");
    const onPaste = (e: ClipboardEvent) => handleClipboardDeterrent(e, "PASTE_ATTEMPT");
    const onCut = (e: ClipboardEvent) => handleClipboardDeterrent(e, "CUT_ATTEMPT");

    window.addEventListener("blur", handleFocusLoss);
    window.addEventListener("focus", handleFocusGain);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);

    return () => {
      window.removeEventListener("blur", handleFocusLoss);
      window.removeEventListener("focus", handleFocusGain);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      if (graceIntervalRef.current) clearInterval(graceIntervalRef.current);
    };
  }, [enabled, attemptId, registerStrike, onNotice]);

  return {
    strikes,
    maxStrikes: 3,
    strikeModalOpen,
    strikeNotice,
    graceSecondsRemaining,
    acknowledgeStrike,
  };
}
