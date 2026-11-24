"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/** nonce: next-themes injects an inline script (to avoid a theme flash) that the CSP must allow. */
export function ThemeProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      {children}
    </NextThemesProvider>
  );
}
