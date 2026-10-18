"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, MailCheck } from "lucide-react";

export function UnlockForm({ setupMissing }: { setupMissing: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"passphrase" | "otp">("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/highgarden/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Highgarden could not be unlocked.");
        return;
      }
      setStep("otp");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/highgarden/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Verification code was not accepted.");
        return;
      }
      router.replace("/dashboard/highgarden");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white dark:bg-slate-900">
        {step === "passphrase" ? (
          <LockKeyhole className="h-5 w-5 text-slate-500 dark:text-slate-400" />
        ) : (
          <MailCheck className="h-5 w-5 text-slate-500 dark:text-slate-400" />
        )}
      </div>

      {step === "passphrase" ? (
        <>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Unlock Highgarden</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter the separate Highgarden passphrase to view behavior analytics.
          </p>

          {setupMissing ? (
            <div className="mt-5 rounded-2xl bg-warning-light px-3 py-2 text-sm text-warning-dark">
              Highgarden needs `HIGHGARDEN_PASSPHRASE_HASH` before it can be unlocked.
            </div>
          ) : (
            <form onSubmit={submitPassphrase} className="mt-6 space-y-3">
              <input
                type="password"
                aria-label="Passphrase"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                className="w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-brand-100 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-900"
                autoFocus
              />
              {error && (
                <div className="rounded-xl bg-danger-light px-3 py-2 text-sm text-danger-dark">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-accent-600 px-3 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-700 disabled:bg-accent-300"
              >
                {busy ? "Checking..." : "Continue"}
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Enter verification code</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A one-time code was emailed to the Highgarden owner. Ask them for it — it expires in 5
            minutes.
          </p>

          <form onSubmit={submitOtp} className="mt-6 space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Verification code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="w-full rounded-xl bg-white px-3 py-2 text-center text-lg tracking-[0.3em] text-slate-900 outline-none transition focus:ring-2 focus:ring-brand-100 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-900"
              autoFocus
            />
            {error && (
              <div className="rounded-xl bg-danger-light px-3 py-2 text-sm text-danger-dark">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-accent-600 px-3 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-700 disabled:bg-accent-300"
            >
              {busy ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("passphrase");
                setCode("");
                setError(null);
              }}
              className="w-full text-center text-xs text-slate-500 hover:underline dark:text-slate-400"
            >
              Start over
            </button>
          </form>
        </>
      )}
    </div>
  );
}
