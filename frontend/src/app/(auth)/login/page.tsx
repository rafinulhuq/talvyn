import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-app dashboard paths are honored; anything else falls back to /dashboard. */
function safeCallback(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.startsWith("/dashboard") && !v.startsWith("//") && !v.includes("\\") ? v : "/dashboard";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const notice = sp.reset === "1" ? "reset" : undefined;
  return <LoginForm callbackUrl={safeCallback(sp.callbackUrl)} notice={notice} />;
}
