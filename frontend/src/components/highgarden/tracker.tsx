"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BLOCKED_SELECTOR, areaOf, visitorId } from "@/lib/highgarden";

/**
 * Highgarden: first-party product analytics. Records page views, clicks,
 * dead clicks (non-interactive targets, or 3 clicks on one target in 4s) and
 * uncaught client errors. It never reads form values or labels from inputs,
 * editors, answers or anything matching BLOCKED_SELECTOR.
 */

type EventType = "PAGE_VIEW" | "CLICK" | "CLIENT_ERROR" | "DEAD_CLICK";
type Meta = Record<string, string | number | boolean | null>;

const DEAD_CLICK_WINDOW_MS = 4000;
const DEAD_CLICK_REPEATS = 3;

const trim = (v: string | null | undefined, max: number) => {
  const s = v?.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
};

function selectorFor(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`.slice(0, 200);
  const tag = el.tagName.toLowerCase();
  const stable = el.getAttribute("data-testid") || el.getAttribute("data-track") || el.getAttribute("aria-label") || el.getAttribute("href");
  return trim(stable ? `${tag}[${stable}]` : tag, 200) ?? tag;
}

function safeLabel(el: Element): string | undefined {
  if (el.closest(BLOCKED_SELECTOR)) return undefined;
  const text = el instanceof HTMLElement ? el.innerText : el.textContent;
  return trim(text, 200) || trim(el.getAttribute("aria-label"), 200) || trim(el.getAttribute("title"), 200);
}

function safeReferrer(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const u = new URL(document.referrer);
    return trim(`${u.origin}${u.pathname}`, 500);
  } catch {
    return undefined;
  }
}

function scrubError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "Unknown error");
  return (
    trim(
      raw
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .replace(/(token|secret|password|passphrase|key)=([^&\s]+)/gi, "$1=[redacted]")
        .replace(/[0-9a-f]{24,}/gi, "[id]"),
      200,
    ) ?? "Unknown error"
  );
}

function fingerprint(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const deviceType = () => {
  const w = window.innerWidth;
  return !w ? "unknown" : w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop";
};

function clickPct(e: MouseEvent) {
  const w = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
  const h = Math.max(1, document.documentElement.clientHeight || window.innerHeight);
  const clamp = (n: number) => Math.min(100, Math.max(0, Number(n.toFixed(2))));
  return { xPct: clamp((e.clientX / w) * 100), yPct: clamp((e.clientY / h) * 100) };
}

function send(payload: { type: EventType; path: string; targetLabel?: string; targetSelector?: string; xPct?: number; yPct?: number; metadataJson?: Meta }) {
  const body = JSON.stringify({
    sessionId: visitorId(),
    referrer: safeReferrer(),
    viewportWidth: window.innerWidth || undefined,
    viewportHeight: window.innerHeight || undefined,
    deviceType: deviceType(),
    ...payload,
  });
  // sendBeacon survives navigation; fall back to keepalive fetch.
  if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
    void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  }
}

const here = () => window.location.pathname || "/";

export function Tracker() {
  const pathname = usePathname();

  useEffect(() => {
    const path = pathname || "/";
    send({ type: "PAGE_VIEW", path, metadataJson: { area: areaOf(path), title: trim(document.title, 120) ?? null } });
  }, [pathname]);

  useEffect(() => {
    const history = new Map<string, number[]>();

    function maybeRepeated(el: Element) {
      const selector = selectorFor(el);
      const now = Date.now();
      const recent = (history.get(selector) ?? []).filter((t) => now - t <= DEAD_CLICK_WINDOW_MS);
      recent.push(now);
      history.set(selector, recent);
      if (recent.length !== DEAD_CLICK_REPEATS) return;
      send({
        type: "DEAD_CLICK",
        path: here(),
        targetLabel: safeLabel(el) || "Repeated click target",
        targetSelector: selector,
        metadataJson: { area: areaOf(here()), reason: "repeated_clicks", count: recent.length },
      });
    }

    function onClick(e: MouseEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(BLOCKED_SELECTOR)) return;
      const coords = clickPct(e);
      const clickable = target.closest("button,a,[role='button'],[role='tab'],[role='menuitem'],label,summary");
      if (!clickable) {
        // A click that changes nothing within 750ms on a non-interactive element.
        const start = here();
        window.setTimeout(() => {
          if (here() !== start) return;
          send({
            type: "DEAD_CLICK",
            path: start,
            targetLabel: safeLabel(target) || "Non-interactive element",
            targetSelector: selectorFor(target),
            ...coords,
            metadataJson: { area: areaOf(start), reason: "non_interactive_click", tag: target.tagName.toLowerCase() },
          });
        }, 750);
        return;
      }
      send({
        type: "CLICK",
        path: here(),
        targetLabel: safeLabel(clickable),
        targetSelector: selectorFor(clickable),
        ...coords,
        metadataJson: { area: areaOf(here()), tag: clickable.tagName.toLowerCase() },
      });
      maybeRepeated(clickable);
    }

    function report(source: string, message: string, extra: Meta = {}) {
      send({
        type: "CLIENT_ERROR",
        path: here(),
        targetLabel: message,
        targetSelector: source,
        metadataJson: { area: areaOf(here()), source, fingerprint: fingerprint(`${source}:${message}`), ...extra },
      });
    }
    const onError = (e: ErrorEvent) =>
      report("window.error", scrubError(e.error ?? e.message), { filename: trim(e.filename, 120) ?? null, line: e.lineno || null, column: e.colno || null });
    const onRejection = (e: PromiseRejectionEvent) => report("unhandledrejection", scrubError(e.reason));

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
