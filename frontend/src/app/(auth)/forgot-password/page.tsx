/**
 * Forgot password page.
 * Requests a single-use password reset link.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TiltBlock } from "@/components/ui/TiltBlock";
import { BrandWordmark } from "@/components/BrandLogo";

const forgotSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = forgotSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-600 selection:text-white flex items-center justify-center px-4 font-sans relative overflow-hidden dark:bg-slate-950 dark:text-slate-100">
      {/* Background Architectural Grid Lines */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <main id="forgot-password-main" className="relative z-10 w-full max-w-md py-12">
        {/* Brand Header */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandWordmark variant="default" className="h-9 w-auto" />
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Account Recovery
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Reset Password
            </h1>
          </div>
        </div>

        {/* 3D Tilt Block Container */}
        <TiltBlock tag="Access Recovery" className="p-6 sm:p-8">
          {submitted ? (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                Dispatch Confirmed
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                If an authorized operator account matches <span className="font-semibold text-slate-900 dark:text-white">{email}</span>, a recovery authorization link has been queued for delivery.
              </p>
              <div className="mt-6 w-full">
                <Link
                  href="/login"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:bg-indigo-700 active:scale-[0.99] transition-all"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 font-sans">
              <Input
                label="Operator Email"
                type="email"
                placeholder="admin@talvyn.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error ?? undefined}
                autoComplete="email"
                autoFocus
                disabled={loading}
              />

              {error && (
                <div
                  role="alert"
                  className="flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                loading={loading}
                variant="primary"
                size="lg"
                className="mt-2 w-full"
              >
                Send Recovery Link
              </Button>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5 dark:text-slate-400 dark:hover:text-indigo-400"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Cancel & Return
                </Link>
              </div>
            </form>
          )}
        </TiltBlock>
      </main>
    </div>
  );
}
