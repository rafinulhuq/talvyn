"use client";

import { createContext, useContext } from "react";
import type { AppUser } from "@/server/session";

export type SystemStatus = { state: "ok" | "degraded" | "unknown"; degraded: number; version?: string };

export type ShellContextValue = {
  user: AppUser;
  status: SystemStatus;
  pendingSignups: number;
  openCommand: () => void;
};

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}
