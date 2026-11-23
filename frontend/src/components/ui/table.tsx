import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Styled table primitives. Data logic lives in DataTable (TanStack); markup lives here. */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-base", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("border-b border-line bg-sunken/60", className)} {...props} />;
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("h-9 px-3 text-sm font-medium text-ink-muted first:pl-4 last:pr-4", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-line last:border-b-0 transition-colors duration-100 hover:bg-sunken/50",
        "data-[selected=true]:bg-accent-soft/60",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("h-11 px-3 align-middle text-ink first:pl-4 last:pr-4", className)} {...props} />;
}
