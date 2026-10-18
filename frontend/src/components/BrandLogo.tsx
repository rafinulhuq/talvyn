import React from "react";
import { clsx } from "clsx";

export type BrandLogoVariant = "auto" | "default" | "on-light" | "on-dark";

interface BrandLogoProps {
  className?: string;
  variant?: BrandLogoVariant;
  ariaLabel?: string;
  showBadge?: boolean;
}

/**
 * Talvyn Monolithic 3D Block T-Nexus Brand Mark.
 * Strictly adheres to the pure monochrome black & white design system.
 */
export function BrandMark({
  className = "h-7 w-7",
  variant = "auto",
  ariaLabel = "Talvyn",
}: BrandLogoProps) {
  const isDark = variant === "on-dark";
  const isLight = !isDark;

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={clsx("shrink-0 transition-transform duration-200 group-hover:scale-105", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="markDarkFront" x1="7" y1="9.5" x2="21" y2="23.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E4E4E7" />
        </linearGradient>
        <linearGradient id="markLightFront" x1="7" y1="9.5" x2="21" y2="23.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#09090B" />
          <stop offset="100%" stopColor="#18181B" />
        </linearGradient>
      </defs>

      {/* Outer Block Frame Tile */}
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="7"
        className={clsx(
          isDark
            ? "fill-black stroke-white/20"
            : isLight
            ? "fill-white stroke-black/15"
            : "fill-black dark:fill-black stroke-black/15 dark:stroke-white/20"
        )}
        strokeWidth="1.25"
      />

      {/* Technical Registration Corner Brackets */}
      <path
        d="M 4 7 L 4 4 L 7 4"
        className={clsx(isLight ? "stroke-black/35" : "stroke-white/35")}
        strokeWidth="1"
        strokeLinecap="square"
      />
      <path
        d="M 25 4 L 28 4 L 28 7"
        className={clsx(isLight ? "stroke-black/35" : "stroke-white/35")}
        strokeWidth="1"
        strokeLinecap="square"
      />
      <path
        d="M 4 25 L 4 28 L 7 28"
        className={clsx(isLight ? "stroke-black/35" : "stroke-white/35")}
        strokeWidth="1"
        strokeLinecap="square"
      />
      <path
        d="M 25 28 L 28 28 L 28 25"
        className={clsx(isLight ? "stroke-black/35" : "stroke-white/35")}
        strokeWidth="1"
        strokeLinecap="square"
      />

      {/* 3D Monolith Facet: Top Plane (Specular Highlight) */}
      <path
        d="M 7 9.5 L 11 6.5 L 25 6.5 L 21 9.5 Z"
        className={clsx(
          isDark
            ? "fill-white"
            : isLight
            ? "fill-zinc-800"
            : "fill-zinc-800 dark:fill-white"
        )}
      />

      {/* 3D Monolith Facet: Lintel Right Wing Depth */}
      <path
        d="M 21 9.5 L 25 6.5 L 25 11 L 21 14 Z"
        className={clsx(
          isDark
            ? "fill-zinc-400"
            : isLight
            ? "fill-zinc-500"
            : "fill-zinc-500 dark:fill-zinc-400"
        )}
      />

      {/* 3D Monolith Facet: Stem Right Side Depth */}
      <path
        d="M 17 14 L 21 11 L 21 20.5 L 17 23.5 Z"
        className={clsx(
          isDark
            ? "fill-zinc-500"
            : isLight
            ? "fill-zinc-600"
            : "fill-zinc-600 dark:fill-zinc-500"
        )}
      />

      {/* 3D Monolith Facet: Front Orthogonal Face with V-Notch Cut */}
      <path
        d="M 7 9.5 L 21 9.5 L 21 14 L 17 14 L 17 23.5 L 14 20.5 L 11 23.5 L 11 14 L 7 14 Z"
        fill={isLight ? "url(#markLightFront)" : "url(#markDarkFront)"}
      />

      {/* Under-Stem V-Notch Depth Shadow */}
      <path
        d="M 11 23.5 L 14 20.5 L 17 23.5 L 19 22 L 14 18.5 L 11 23.5 Z"
        className={clsx(
          isDark
            ? "fill-zinc-900"
            : isLight
            ? "fill-zinc-200"
            : "fill-zinc-200 dark:fill-zinc-900"
        )}
      />

      {/* Central Kinetic V-Chevron Vector */}
      <path
        d="M 11 14 L 14 17.5 L 17 14"
        className={clsx(
          isDark
            ? "stroke-black/50"
            : isLight
            ? "stroke-white/70"
            : "stroke-white/70 dark:stroke-black/50"
        )}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full Talvyn Monolithic Wordmark:
 * 3D Block T-Nexus Mark + Brutalist Display Typography + System Badge.
 */
export function BrandWordmark({
  className = "h-7",
  variant = "auto",
  ariaLabel = "Talvyn",
  showBadge = true,
}: BrandLogoProps) {
  const isDark = variant === "on-dark";
  const isLight = !isDark;

  return (
    <div
      className={clsx("group inline-flex items-center gap-2.5 font-sans select-none", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <BrandMark className="h-7 w-7" variant={variant} ariaLabel={ariaLabel} />

      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "font-display text-lg font-black tracking-tight transition-colors",
            isDark
              ? "text-white"
              : isLight
              ? "text-black"
              : "text-black dark:text-white"
          )}
        >
          TALVYN
        </span>

        {showBadge && (
          <span
            className={clsx(
              "hidden sm:inline-flex items-center border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase",
              isDark
                ? "border-white/20 bg-zinc-900 text-zinc-400"
                : isLight
                ? "border-black/15 bg-zinc-100 text-zinc-600"
                : "border-black/15 dark:border-white/20 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400"
            )}
          >
            SYS
          </span>
        )}
      </div>
    </div>
  );
}
