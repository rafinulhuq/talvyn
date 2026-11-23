import { cn } from "@/lib/cn";

/**
 * Brand usage by size:
 *   - <Logo>      app chrome: the T mark + "TALVYN" as live text (matches the
 *                 lockup's wide-tracked caps, stays crisp down to 16px).
 *   - <LogoLockup> the full artwork (wordmark, "Intelligence platform", version
 *                 badge) for large placements only: it's unreadable below ~48px tall.
 */
export function Logo({ className, height = 22 }: { className?: string; height?: number }) {
  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap: Math.round(height * 0.4) }}>
      <LogoMark size={height} />
      <span
        className="font-semibold text-ink"
        style={{ fontSize: Math.round(height * 0.62), letterSpacing: "0.18em", lineHeight: 1 }}
      >
        TALVYN
      </span>
    </span>
  );
}

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", className)} style={{ height: size, width: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
      <img src="/brand/talvyn-mark.svg" alt="" width={size} height={size} className="dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
      <img src="/brand/talvyn-mark-inverse.svg" alt="" width={size} height={size} className="hidden dark:block" />
    </span>
  );
}

export function LogoLockup({ height = 64, className }: { height?: number; className?: string }) {
  const width = Math.round(height * 4.5);
  return (
    <span className={cn("inline-flex", className)} style={{ height, width }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
      <img src="/brand/talvyn-logo.svg" alt="Talvyn" width={width} height={height} className="dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
      <img src="/brand/talvyn-logo-inverse.svg" alt="Talvyn" width={width} height={height} className="hidden dark:block" />
    </span>
  );
}
