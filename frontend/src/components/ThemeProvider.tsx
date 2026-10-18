"use client";

/**
 * App-wide theme provider (light / dark / system).
 *
 * Wraps `next-themes`, which toggles a `class="dark"` on <html> and persists
 * the choice to localStorage. Tailwind is configured with `darkMode: "class"`
 * (see tailwind.config.ts), so `dark:` variants key off that class.
 *
 * `suppressHydrationWarning` on <html> (set in the root layout) is required
 * because next-themes writes the class before React hydrates to avoid a
 * flash of the wrong theme.
 *
 * Dark mode is intentionally **opt-in** (defaultTheme "light", system
 * detection off): the toggle lives only in the admin shell, and the dark
 * styling is scoped to the admin dashboard (see the admin dark-mode
 * compatibility layer in globals.css). The public marketing site and the
 * candidate exam have not been converted yet, so we never auto-apply dark to
 * a visitor based on their OS preference — that would render those
 * unconverted surfaces broken.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      forcedTheme="light"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
