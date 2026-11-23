import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-[3px] border border-line bg-sunken px-1 font-sans text-xs text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
