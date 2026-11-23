"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={4}
        align="end"
        className={cn("z-50 min-w-44 rounded-menu border border-line bg-surface p-1 shadow-float animate-pop-in", className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  shortcut,
  destructive,
  asChild,
  children,
  ...props
}: ComponentProps<typeof Menu.Item> & { shortcut?: ReactNode; destructive?: boolean }) {
  return (
    <Menu.Item
      asChild={asChild}
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2 rounded-control px-2 text-base outline-none",
        "data-[highlighted]:bg-sunken data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-muted",
        destructive ? "text-danger [&_svg]:text-danger" : "text-ink",
        className,
      )}
      {...props}
    >
      {/* With asChild, Radix's Slot requires exactly one child element. */}
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {shortcut && <span className="ml-auto pl-4 text-sm text-ink-muted">{shortcut}</span>}
        </>
      )}
    </Menu.Item>
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2 pb-1 pt-1.5 text-sm text-ink-muted", className)} {...props} />;
}
