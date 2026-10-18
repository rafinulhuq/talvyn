/**
 * useSuspiciousEvents
 *
 * Detects and enforces exam-integrity rules during an active attempt.
 *
 * Hard enforcement (calls onViolation — caller terminates the attempt):
 *   TAB_SWITCH / VISIBILITY_HIDDEN — document goes hidden (tab switch, minimize)
 *   WINDOW_BLUR                    — window loses focus (switched to another window)
 *
 * Soft enforcement (blocked + logged, exam continues — calls onBlocked for a toast):
 *   COPY_ATTEMPT / PASTE_ATTEMPT / CUT_ATTEMPT — clipboard events, both
 *     keyboard-triggered (Ctrl/Cmd+C/V/X) and menu/middle-click-triggered
 *   CONTEXT_MENU      — right-click, always blocked (no textarea/input exception —
 *     candidates must not be able to paste into ANY answer type, including code)
 *   BLOCKED_SHORTCUT  — Ctrl/Cmd+S (save) / +P (print) always; +A (select-all)
 *     only outside an answer textarea, so candidates can still select-all
 *     *within their own answer* to edit it
 *   Drag/drop of text is also blocked (dragstart/drop)
 *
 * Logged events are rate-limited (1 per type per 5s) to avoid flooding the
 * backend; blocking + the toast callback fire on every occurrence regardless,
 * since the candidate needs feedback every time they try.
 *
 * This is an integrity DETERRENT, not unbypassable protection — see
 * docs/feature-checklist.md.
 */

"use client";

import { useEffect, useRef } from "react";
import { attemptsApi } from "@/lib/api/attempts";
import type { SuspiciousEventType } from "@/types/attempt";

interface UseSuspiciousEventsOptions {
  attemptId: string;
  enabled?: boolean;
  /** First tab-switch/window-blur — caller should hard-terminate the attempt. */
  onViolation?: (type: SuspiciousEventType) => void;
  /** A copy/paste/shortcut/etc was blocked — caller should show a brief toast. */
  onBlocked?: (message: string) => void;
}

const RATE_LIMIT_MS = 5_000;
const BLOCKED_MESSAGE = "Copy and paste are disabled during this assessment.";

export function useSuspiciousEvents({
  attemptId,
  enabled = true,
  onViolation,
  onBlocked,
}: UseSuspiciousEventsOptions): void {
  const lastLoggedRef = useRef<Partial<Record<SuspiciousEventType, number>>>({});
  const violatedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    violatedRef.current = false;
  }, [enabled, attemptId]);

  useEffect(() => {
    if (!enabled) return;

    const log = (type: SuspiciousEventType, metadata?: Record<string, unknown>) => {
      const now = Date.now();
      const last = lastLoggedRef.current[type] ?? 0;
      if (now - last < RATE_LIMIT_MS) return; // Rate-limited
      lastLoggedRef.current[type] = now;
      attemptsApi.logEvent(attemptId, { event_type: type, metadata });
    };

    const violate = (type: SuspiciousEventType) => {
      if (violatedRef.current) return; // Already terminating — don't double-fire
      violatedRef.current = true;
      log(type);
      onViolation?.(type);
    };

    const block = (type: SuspiciousEventType, metadata?: Record<string, unknown>) => {
      log(type, metadata);
      onBlocked?.(BLOCKED_MESSAGE);
    };

    // ── Hard enforcement: visibility / focus loss ──────────
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        violate("VISIBILITY_HIDDEN");
      }
    };
    const onBlur = () => {
      violate("WINDOW_BLUR");
    };

    // ── Clipboard events (covers menu/middle-click, not just keyboard) ──
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      block("COPY_ATTEMPT");
    };
    const onCut = (e: ClipboardEvent) => {
      e.preventDefault();
      block("CUT_ATTEMPT");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      block("PASTE_ATTEMPT");
    };

    // ── Drag/drop of text ───────────────────────────────────
    const onDragStart = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    // ── Keyboard shortcuts ──────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();
      if (key === "c") {
        e.preventDefault();
        block("COPY_ATTEMPT");
      } else if (key === "v") {
        e.preventDefault();
        block("PASTE_ATTEMPT");
      } else if (key === "x") {
        e.preventDefault();
        block("CUT_ATTEMPT");
      } else if (key === "s" || key === "p") {
        e.preventDefault();
        block("BLOCKED_SHORTCUT", { key });
      } else if (key === "a") {
        // Allow select-all WITHIN an answer textarea (normal editing of your
        // own answer); block it everywhere else (selecting all question
        // content on the page to copy it out).
        const target = e.target as HTMLElement;
        const isAnswerField = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
        if (!isAnswerField) {
          e.preventDefault();
          block("BLOCKED_SHORTCUT", { key });
        }
      }
    };

    // ── Context menu — always blocked, no exceptions ───────
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      block("CONTEXT_MENU");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("drop", onDrop);
    };
  }, [attemptId, enabled, onViolation, onBlocked]);
}
