"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Optional stagger delay in ms — use when you have multiple AnimatedSections close together */
  delay?: number;
}

/**
 * Wraps a landing-page section and reveals it with a fade + upward slide as
 * soon as it enters the viewport. Uses IntersectionObserver so the animation
 * only plays once, lazily, without any scroll-listener overhead.
 */
export function AnimatedSection({ children, className = "", delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.07, rootMargin: "0px 0px -32px 0px" },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none motion-reduce:!translate-y-0 motion-reduce:!opacity-100 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}
