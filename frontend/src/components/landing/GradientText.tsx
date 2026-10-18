import type { ReactNode } from "react";
import clsx from "clsx";

export function GradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "bg-gradient-to-r from-brand-700 to-brand-900 bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}
