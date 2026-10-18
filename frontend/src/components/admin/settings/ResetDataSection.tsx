"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { ResetDataResponse } from "@/types/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const RESET_CONFIRMATION = "DELETE ALL";

export function ResetDataSection() {
  const [confirmation, setConfirmation] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetDataResponse | null>(null);

  const canReset = confirmation === RESET_CONFIRMATION && !isResetting;

  async function handleReset() {
    if (!canReset) return;

    setIsResetting(true);
    setError(null);
    setResult(null);

    const response = await adminApi.resetData(confirmation);
    setIsResetting(false);

    if (!response.success) {
      setError(response.error.message);
      return;
    }

    setConfirmation("");
    setResult(response.data);
  }

  const deletedTotal = result
    ? Object.values(result.deleted_counts).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <div className="rounded-xl border border-rose-200/80 bg-white p-6 shadow-xs dark:border-rose-900/60 dark:bg-slate-900">
      <div className="mb-5 flex items-start gap-3 border-b border-rose-100 pb-4 dark:border-rose-900/40">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Danger Zone</h2>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
              Destructive
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Delete all job descriptions, tests, candidates, invitations, public
            links, attempts, answers, evaluations, and uploaded JD files. Admin
            users and sign-in stay untouched.
          </p>
        </div>
      </div>

      {result && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {result.message}
          </div>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            Deleted {deletedTotal} database records and {result.deleted_files}{" "}
            uploaded files.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input
          label='Type "DELETE ALL" to confirm'
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={RESET_CONFIRMATION}
          disabled={isResetting}
        />
        <Button
          type="button"
          variant="danger"
          loading={isResetting}
          disabled={!canReset}
          leftIcon={<Trash2 className="h-4 w-4" />}
          onClick={handleReset}
          className="sm:mb-[1px]"
        >
          Delete all data
        </Button>
      </div>
    </div>
  );
}
