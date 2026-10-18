"use client";

import { useRef, useState, type ReactNode, type MouseEvent } from "react";
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotX = ((y - centerY) / centerY) * -7;
    const rotY = ((x - centerX) / centerX) * 7;

    setRotateX(rotX);
    setRotateY(rotY);
    setGlarePos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    });
  };

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div
      style={{ perspective: 1200 }}
      className="w-full transition-transform duration-200"
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: isHovered
            ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`
            : "rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
          transition: isHovered
            ? "transform 0.1s ease-out"
            : "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className={clsx(
          "relative overflow-hidden rounded-2xl border border-slate-300/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-slate-100 shadow-[0_1px_3px_0_rgba(15,23,42,0.06),0_1px_2px_-1px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 transition-all duration-300 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-xl hover:ring-indigo-500/20",
          className
        )}
      >
        {/* Specular glare dynamic light sheen */}
        {isHovered && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px opacity-50 transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle 350px at ${glarePos.x}% ${glarePos.y}%, rgba(99,102,241,0.08), transparent 75%)`,
            }}
          />
        )}

        {/* Subtle accent corner highlights */}
        {accentCorner && (
          <>
            <span className="absolute top-2 left-2 h-1 w-1 rounded-full bg-indigo-500/30" />
            <span className="absolute top-2 right-2 h-1 w-1 rounded-full bg-indigo-500/30" />
          </>
        )}

        {/* Clean Tech Tag */}
        {tag && (
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{tag}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
