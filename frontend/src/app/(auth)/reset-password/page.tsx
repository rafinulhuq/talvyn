/**
 * Reset password page.
 * Validates the reset token and allows the user to choose a new password.
 */

"use client";

import { Suspense, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TiltBlock } from "@/components/ui/TiltBlock";
import { BrandWordmark } from "@/components/BrandLogo";

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetShell loading />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate token format before rendering the form
  if (!token || !TOKEN_PATTERN.test(token)) {
    return (
      <ResetShell>
        <div className="flex flex-col items-center text-center font-sans">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Expired or Invalid Token
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            This security authorization link is invalid or has expired. Token lifetimes are limited to 30 minutes for security defensibility.
          </p>
          <div className="mt-6 w-full">
            <Link
              href="/forgot-password"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:bg-indigo-700 active:scale-[0.99] transition-all"
            >
              Request New Token
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700 underline dark:text-indigo-400 dark:hover:text-indigo-300">
              Return to Sign In
            </Link>
          </p>
        </div>
      </ResetShell>
    );
  }

  if (success) {
    return (
      <ResetShell>
        <div className="flex flex-col items-center text-center font-sans">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Password Updated
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Your operator security key has been reprogrammed. All legacy session authorizations have been revoked.
          </p>
          <div className="mt-6 w-full">
            <Link
              href="/login"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:bg-indigo-700 active:scale-[0.99] transition-all"
            >
              Sign In with New Password
            </Link>
          </div>
        </div>
      </ResetShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const newErrors: { password?: string; confirmPassword?: string } = {};

    if (!password || password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (new TextEncoder().encode(password).length > 72) {
      newErrors.password = "Password must be at most 72 bytes";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSubmitError(
          data?.error?.message ?? "Unable to reset password. Please request a new link."
        );
        return;
      }

      setSuccess(true);
    } catch {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ResetShell>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 font-sans">
        <Input
          label="New Password (min 8 chars)"
          type="password"
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
          autoFocus
          disabled={loading}
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="••••••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
          disabled={loading}
        />

        {submitError && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{submitError}</span>
          </div>
        )}

        <Button
          type="submit"
          loading={loading}
          variant="primary"
          size="lg"
          className="mt-2 w-full"
        >
          Confirm & Update Password
        </Button>
      </form>
    </ResetShell>
  );
}

function ResetShell({
  children,
  loading = false,
}: {
  children?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-600 selection:text-white flex items-center justify-center px-4 font-sans relative overflow-hidden py-16 dark:bg-slate-950 dark:text-slate-100">
      {/* Background Architectural Grid Lines */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <main className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandWordmark variant="default" className="h-9 w-auto" />
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Account Security
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Update Security Key
            </h1>
          </div>
        </div>

        <TiltBlock tag="Key Rotation" className="p-6 sm:p-8">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600 dark:text-indigo-400" />
            </div>
          ) : (
            children
          )}
        </TiltBlock>
      </main>
    </div>
  );
}
