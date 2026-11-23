"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Label + control + hint/error, wired for screen readers.
 * The single child control receives id, aria-describedby and aria-invalid.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactElement<ControlProps>;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-muted">Optional</span>}
      </label>
      {control}
      {error ? (
        <p id={errorId} className="text-sm text-danger">{error}</p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
