"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// True only after hydration, so the server and first client render match.
const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-control border border-line bg-surface p-0.5", className)}>
      {options.map(({ value, label, icon: Icon }) => {
        const active = hydrated && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "grid size-7 place-items-center rounded-[3px] text-ink-muted transition-colors duration-150 hover:text-ink",
              active && "bg-sunken text-ink",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
