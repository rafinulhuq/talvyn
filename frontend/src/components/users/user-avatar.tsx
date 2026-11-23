"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

/**
 * Uploaded picture if there is one, otherwise initials. The image is probed
 * after mount: an <img> that fails before hydration never reports onError,
 * which would leave a broken-image icon.
 */
export function UserAvatar({ id, name, size = 32, className }: { id: string; name: string; size?: number; className?: string }) {
  const src = `/api/users/${id}/avatar`;
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => live && setLoaded(src);
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (loaded === src) {
    // eslint-disable-next-line @next/next/no-img-element -- served by our own authenticated route, not optimisable
    return <img src={src} alt="" width={size} height={size} style={style} className={cn("shrink-0 rounded-full border border-line object-cover", className)} />;
  }
  return (
    <span aria-hidden style={style} className={cn("grid shrink-0 place-items-center rounded-full border border-line bg-sunken font-medium text-ink-muted", className)}>
      {initials(name)}
    </span>
  );
}
