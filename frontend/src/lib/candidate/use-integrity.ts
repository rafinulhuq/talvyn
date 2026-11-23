"use client";

import { useEffect, useRef } from "react";
import type { IntegrityEvent } from "@/types/attempt";
import { attempts } from "./client";

const LOG_EVERY_MS = 5_000; // per event type, so a held key doesn't flood the backend
export const BLOCKED_MESSAGE = "Copy and paste are turned off during this assessment.";

/**
 * Integrity rules while an attempt is active (unchanged from the previous frontend):
 * - Ends the attempt: the page becoming hidden (tab switch, minimise) or the window losing focus.
 * - Blocked and logged, test continues: copy, cut, paste (keyboard and menu), right-click,
 *   Ctrl/Cmd+S and +P, Ctrl/Cmd+A outside an answer field, and dragging or dropping text.
 * A deterrent, not a guarantee.
 */
export function useIntegrity({ attemptId, enabled, onViolation, onBlocked }: { attemptId: string; enabled: boolean; onViolation: (e: IntegrityEvent) => void; onBlocked: (message: string) => void }) {
  const cbs = useRef({ onViolation, onBlocked });
  useEffect(() => {
    cbs.current = { onViolation, onBlocked };
  });

  useEffect(() => {
    if (!enabled) return;
    let violated = false;
    const last: Partial<Record<IntegrityEvent, number>> = {};
    const log = (type: IntegrityEvent, metadata?: Record<string, unknown>) => {
      const now = Date.now();
      if (now - (last[type] ?? 0) < LOG_EVERY_MS) return;
      last[type] = now;
      void attempts.event(attemptId, type, metadata);
    };
    const violate = (type: IntegrityEvent) => {
      if (violated) return;
      violated = true;
      log(type);
      cbs.current.onViolation(type);
    };
    const block = (e: Event, type: IntegrityEvent, metadata?: Record<string, unknown>) => {
      e.preventDefault();
      log(type, metadata);
      cbs.current.onBlocked(BLOCKED_MESSAGE);
    };

    const onVisibility = () => document.visibilityState === "hidden" && violate("VISIBILITY_HIDDEN");
    const onBlur = () => violate("WINDOW_BLUR");
    const onCopy = (e: ClipboardEvent) => block(e, "COPY_ATTEMPT");
    const onCut = (e: ClipboardEvent) => block(e, "CUT_ATTEMPT");
    const onPaste = (e: ClipboardEvent) => block(e, "PASTE_ATTEMPT");
    const onContext = (e: MouseEvent) => block(e, "CONTEXT_MENU");
    const onDrag = (e: DragEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "c") block(e, "COPY_ATTEMPT");
      else if (k === "v") block(e, "PASTE_ATTEMPT");
      else if (k === "x") block(e, "CUT_ATTEMPT");
      else if (k === "s" || k === "p") block(e, "BLOCKED_SHORTCUT", { key: k });
      else if (k === "a") {
        const t = e.target as HTMLElement | null;
        if (!(t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT"))) block(e, "BLOCKED_SHORTCUT", { key: k });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("dragstart", onDrag);
    document.addEventListener("drop", onDrag);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("dragstart", onDrag);
      document.removeEventListener("drop", onDrag);
    };
  }, [attemptId, enabled]);
}
