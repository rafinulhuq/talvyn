"use client";

import { LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { roleLabel } from "./nav";
import { useShell } from "./shell-context";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-line bg-sunken font-medium text-ink-muted"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu() {
  const { user } = useShell();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className="flex items-center gap-2 rounded-control p-1 hover:bg-sunken">
          <Avatar name={user.name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="px-2 pb-2 pt-1.5">
          <p className="truncate text-base font-medium text-ink">{user.name}</p>
          <p className="truncate text-sm text-ink-muted">{user.email}</p>
          <p className="mt-1 text-sm text-ink-muted">{roleLabel(user.role)}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile">
            <UserRound aria-hidden /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <Menu.RadioGroup value={theme} onValueChange={setTheme} aria-label="Theme">
          {(
            [
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["system", "Match system", Monitor],
            ] as const
          ).map(([value, label, Icon]) => (
            <Menu.RadioItem
              key={value}
              value={value}
              className="flex h-8 cursor-default select-none items-center gap-2 rounded-control px-2 text-base text-ink outline-none data-[highlighted]:bg-sunken data-[state=checked]:font-medium"
            >
              <Icon aria-hidden className="size-4 text-ink-muted" />
              {label}
              <Menu.ItemIndicator className="ml-auto size-1.5 rounded-full bg-accent" />
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
