"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { HIGHGARDEN_BLOCKED_SELECTOR_PARTS } from "./highgardenPrivacy";

const COOKIE_NAME = "hg_sid";
const MAX_LABEL = 200;
const MAX_SELECTOR = 200;
const MAX_REFERRER = 500;
const DEAD_CLICK_WINDOW_MS = 4000;
const DEAD_CLICK_REPEAT_THRESHOLD = 3;

type HighGardenEventType = "PAGE_VIEW" | "CLICK" | "CLIENT_ERROR" | "DEAD_CLICK";

function getCookie(name: string): string | null {
  const found = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function getSessionId(): string {
  const existing = getCookie(COOKIE_NAME);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=${maxAge}; samesite=lax`;
  return id;
}

function trim(value: string | null | undefined, max: number): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function selectorFor(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`.slice(0, MAX_SELECTOR);
  const stable =
    el.getAttribute("data-testid") ||
    el.getAttribute("data-track") ||
    el.getAttribute("aria-label") ||
    el.getAttribute("href");
  const tag = el.tagName.toLowerCase();
  return trim(stable ? `${tag}[${stable}]` : tag, MAX_SELECTOR) || tag;
}

function safeElementLabel(el: HTMLElement): string | undefined {
  if (el.matches(HIGHGARDEN_BLOCKED_SELECTOR_PARTS) || el.closest(HIGHGARDEN_BLOCKED_SELECTOR_PARTS)) return undefined;
  return (
    trim(el.innerText, MAX_LABEL) ||
    trim(el.getAttribute("aria-label"), MAX_LABEL) ||
    trim(el.getAttribute("title"), MAX_LABEL)
  );
}

function safeReferrer(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const url = new URL(document.referrer);
    return trim(`${url.origin}${url.pathname}`, MAX_REFERRER);
  } catch {
    return trim(document.referrer, MAX_REFERRER);
  }
}

function fingerprint(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function sanitizeErrorMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "Unknown error");
  return trim(
    raw
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/(token|secret|password|passphrase|key)=([^&\s]+)/gi, "$1=[redacted]")
      .replace(/[0-9a-f]{24,}/gi, "[id]"),
    MAX_LABEL
  ) || "Unknown error";
}

function deviceType(): "desktop" | "tablet" | "mobile" | "unknown" {
  const width = window.innerWidth;
  if (!width) return "unknown";
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function areaForPath(path: string): string {
  if (path.startsWith("/dashboard")) return "admin";
  if (path.startsWith("/tests") || path.startsWith("/test") || path.startsWith("/exam")) return "candidate_exam";
  if (path.startsWith("/apply")) return "candidate_apply";
  if (path.startsWith("/blog")) return "blog";
  return "public";
}

function clickPercent(event: MouseEvent): { xPct: number; yPct: number } {
  const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1);
  const height = Math.max(1, document.documentElement.clientHeight || window.innerHeight || 1);
  return {
    xPct: Math.min(100, Math.max(0, Number(((event.clientX / width) * 100).toFixed(2)))),
    yPct: Math.min(100, Math.max(0, Number(((event.clientY / height) * 100).toFixed(2)))),
  };
}

function send(payload: {
  type: HighGardenEventType;
  path: string;
  targetLabel?: string;
  targetSelector?: string;
  xPct?: number;
  yPct?: number;
  metadataJson?: Record<string, string | number | boolean | null>;
}) {
  const body = JSON.stringify({
    sessionId: getSessionId(),
    referrer: safeReferrer(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    deviceType: deviceType(),
    ...payload,
  });
  const blob = new Blob([body], { type: "application/json" });
  if (!navigator.sendBeacon?.("/api/track", blob)) {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }
}

export function HighGardenTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const path = pathname || "/";
    send({
      type: "PAGE_VIEW",
      path,
      metadataJson: {
        area: areaForPath(path),
        title: trim(document.title, 120) ?? null,
      },
    });
  }, [pathname]);

  useEffect(() => {
    const clickHistory = new Map<string, number[]>();

    function recordPossibleDeadClick(clickable: HTMLElement) {
      const selector = selectorFor(clickable);
      const now = Date.now();
      const recent = (clickHistory.get(selector) ?? []).filter((time) => now - time <= DEAD_CLICK_WINDOW_MS);
      recent.push(now);
      clickHistory.set(selector, recent);
      if (recent.length !== DEAD_CLICK_REPEAT_THRESHOLD) return;
      send({
        type: "DEAD_CLICK",
        path: window.location.pathname || "/",
        targetLabel: safeElementLabel(clickable) || "Repeated click target",
        targetSelector: selector,
        metadataJson: {
          area: areaForPath(window.location.pathname || "/"),
          reason: "repeated_clicks",
          count: recent.length,
        },
      });
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const coordinates = clickPercent(event);
      if (target?.closest(HIGHGARDEN_BLOCKED_SELECTOR_PARTS)) return;
      const clickable = target?.closest("button,a,[role='button']");
      if (!(clickable instanceof HTMLElement)) {
        const deadTarget = target instanceof HTMLElement ? target : null;
        if (!deadTarget) return;
        const startingPath = window.location.pathname;
        window.setTimeout(() => {
          if (window.location.pathname !== startingPath) return;
          send({
            type: "DEAD_CLICK",
            path: startingPath || "/",
            targetLabel: safeElementLabel(deadTarget) || "Non-interactive element",
            targetSelector: selectorFor(deadTarget),
            ...coordinates,
            metadataJson: {
              area: areaForPath(startingPath || "/"),
              reason: "non_interactive_click",
              tag: deadTarget.tagName.toLowerCase(),
            },
          });
        }, 750);
        return;
      }
      send({
        type: "CLICK",
        path: window.location.pathname || "/",
        targetLabel: safeElementLabel(clickable),
        targetSelector: selectorFor(clickable),
        ...coordinates,
        metadataJson: {
          area: areaForPath(window.location.pathname || "/"),
          tag: clickable.tagName.toLowerCase(),
        },
      });
      recordPossibleDeadClick(clickable);
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  useEffect(() => {
    function reportClientError(source: string, message: string, extra: Record<string, string | number | boolean | null> = {}) {
      send({
        type: "CLIENT_ERROR",
        path: window.location.pathname || "/",
        targetLabel: message,
        targetSelector: source,
        metadataJson: {
          area: areaForPath(window.location.pathname || "/"),
          source,
          fingerprint: fingerprint(`${source}:${message}`),
          ...extra,
        },
      });
    }

    function onError(event: ErrorEvent) {
      const message = sanitizeErrorMessage(event.error ?? event.message);
      reportClientError("window.error", message, {
        filename: trim(event.filename, 120) ?? null,
        line: event.lineno || null,
        column: event.colno || null,
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      reportClientError("unhandledrejection", sanitizeErrorMessage(event.reason));
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
