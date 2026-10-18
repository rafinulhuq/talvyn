/**
 * UserPasswordResetModal — allows a Super Admin to reset any user's password.
 * Offers two methods:
 * 1. Email a single-use 30-minute password reset link to the account owner.
 * 2. Set a new password directly (invalidates all existing sessions immediately).
 */

"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { KeyRound, Mail, Lock, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface UserPasswordResetModalProps {
  userId: string;
  userName: string;
  userEmail: string;
  onClose: () => void;
}

export function UserPasswordResetModal({
  userId,
  userName,
  userEmail,
  onClose,
}: UserPasswordResetModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [tab, setTab] = useState<"email" | "direct">("email");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const onDialogCancel = useEffectEvent((event: Event) => {
    event.preventDefault();
    if (!loading) onClose();
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener("cancel", onDialogCancel);
    return () => dialog.removeEventListener("cancel", onDialogCancel);
  }, []);

  async function handleSendEmail() {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "email" }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? "Failed to send reset email.");
        return;
      }

      setSuccessMessage("Password reset email sent successfully.");
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDirectly(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

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
      setFieldErrors(newErrors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          password,
          confirmPassword,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? "Failed to update password.");
        return;
      }

      setSuccessMessage("Password reset successfully. Active sessions revoked.");
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="open:flex m-0 h-full max-h-full w-full max-w-full items-center justify-center border-0 bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-md backdrop:animate-fade-backdrop motion-reduce:backdrop:animate-none"
    >
      <div className="mx-4 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl animate-fade-in motion-reduce:animate-none dark:bg-slate-900">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Reset Password
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userName} ({userEmail})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode switcher tabs */}
        <div className="mt-4 flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => { setTab("email"); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
              tab === "email"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Send Reset Email
          </button>
          <button
            type="button"
            onClick={() => { setTab("direct"); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
              tab === "direct"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            Set Directly
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-light p-3 text-xs text-danger-dark"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-lg border border-success/40 bg-success-light p-3 text-xs text-success-dark"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {tab === "email" ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Sends an email to <span className="font-medium text-slate-900 dark:text-slate-100">{userEmail}</span> containing
              a secure link to choose a new password. The link is valid for 30 minutes.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSendEmail}
                disabled={loading || Boolean(successMessage)}
                leftIcon={loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              >
                {loading ? "Sending…" : "Send Reset Link"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSetDirectly} noValidate className="mt-4 flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Directly sets a new password. All currently active sessions for this account will be signed out immediately.
            </p>

            <Input
              label="New password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              helperText="At least 8 characters"
              autoComplete="new-password"
              disabled={loading || Boolean(successMessage)}
            />

            <Input
              label="Confirm new password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={fieldErrors.confirmPassword}
              autoComplete="new-password"
              disabled={loading || Boolean(successMessage)}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={loading || Boolean(successMessage)}
                leftIcon={loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              >
                {loading ? "Updating…" : "Set Password"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
