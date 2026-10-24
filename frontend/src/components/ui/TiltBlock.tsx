import { type ReactNode } from "react";
import { clsx } from "clsx";

interface TiltBlockProps {
  children: ReactNode;
  className?: string;
  tag?: string;
  accentCorner?: boolean;
}

export function TiltBlock({
  children,
  className,
  tag,
  accentCorner = true,
}: TiltBlockProps) {
  return (
    <div
      className={clsx(
        "relative rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 text-white",
        "transition-colors duration-200 hover:border-white/[0.18]",
        className
      )}
    >
      {/* Subtle accent corner dot */}
      {accentCorner && (
        <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-[#F2D74E]/40" />
      )}

      {/* Technical Header Tag */}
      {tag && (
        <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-2.5 text-[11px] font-mono tracking-wider text-[#8A8F98] uppercase">
          <span>{tag}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
        </div>
      )}

      {children}
    </div>
  );
}
