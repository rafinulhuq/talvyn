"use client";

import { useState } from "react";
import Image from "next/image";
import clsx from "clsx";

interface UserAvatarProps {
  userId: string;
  name?: string | null;
  /** Square size in px. */
  size?: number;
  /** Applied to both the image and the initials fallback (e.g. shrink-0). */
  className?: string;
  /** Applied only to the initials fallback (e.g. background/text color). */
  fallbackClassName?: string;
  /**
   * Appended as a `?v=` query param to force a fresh request past both the
   * browser's HTTP cache and this component's own "already failed, don't
   * retry" state — the serving URL is otherwise stable per user
   * (avatars/{id}.webp), so a change here is the only thing that makes an
   * upload/removal show up immediately in the same tab that made it.
   */
  cacheBust?: string | number;
}

/**
 * Renders a user's uploaded profile picture, falling back to the existing
 * initials-circle treatment when there's no picture (GET /api/users/{id}/avatar
 * 404s) or userId is missing. One shared implementation instead of the three
 * independent initials-circle copies previously in Sidebar/AdminShell/the
 * Users list.
 */
export function UserAvatar({
  userId,
  name,
  size = 32,
  className,
  fallbackClassName,
  cacheBust,
}: UserAvatarProps) {
  // Tracks which cacheBust value the *last* image-load failure happened for,
  // rather than a plain boolean — so a new cacheBust (the caller just
  // uploaded/removed a picture) automatically means "worth trying again"
  // just by being compared during render, no effect needed to resync it.
  // Starts at NaN (never equal to itself, let alone a real cacheBust value —
  // including undefined) so the very first render always attempts the image.
  const [failedForCacheBust, setFailedForCacheBust] = useState<string | number | undefined>(NaN);
  const imageFailed = failedForCacheBust === cacheBust;

  if (imageFailed || !userId) {
    return (
      <div
        style={{ width: size, height: size }}
        className={clsx(
          "flex shrink-0 items-center justify-center rounded-full border border-[#F2D74E]/30 bg-[#181A1F] text-[#F2D74E] font-semibold text-xs uppercase shadow-xs",
          className,
          fallbackClassName
        )}
      >
        {name?.charAt(0).toUpperCase() ?? "?"}
      </div>
    );
  }

  const src = `/api/users/${userId}/avatar${cacheBust !== undefined ? `?v=${cacheBust}` : ""}`;

  return (
    <Image
      key={src}
      src={src}
      alt={name ? `${name}'s avatar` : "User avatar"}
      width={size}
      height={size}
      className={clsx("shrink-0 rounded-full object-cover", className)}
      onError={() => setFailedForCacheBust(cacheBust)}
    />
  );
}
