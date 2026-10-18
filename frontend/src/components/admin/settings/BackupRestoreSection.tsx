"use client";

import { useReducer, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, DatabaseBackup, Download, Upload } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { BackupPayload, RestoreDataResponse } from "@/types/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const RESTORE_CONFIRMATION = "RESTORE BACKUP";

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.created_at === "string" &&
    typeof record.tables === "object" &&
    record.tables !== null &&
    Array.isArray(record.files)
  );
}

function downloadBackup(backup: BackupPayload) {
  const timestamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `talvyn-backup-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type Notice =
  | { kind: "message"; text: string }
  | { kind: "error"; text: string }
  | { kind: "restored"; result: RestoreDataResponse };

const EMPTY_SELECTION = { fileName: null as string | null, payload: null as BackupPayload | null, confirmation: "" };
type Selection = typeof EMPTY_SELECTION;
type SelectionAction =
  | { type: "setFile"; fileName: string; payload: BackupPayload | null }
  | { type: "clearFile" }
  | { type: "setConfirmation"; value: string }
  | { type: "reset" };

function selectionReducer(state: Selection, action: SelectionAction): Selection {
  switch (action.type) {
    case "setFile":
      return { ...state, fileName: action.fileName, payload: action.payload };
    case "clearFile":
      return { ...state, fileName: null, payload: null };
    case "setConfirmation":
      return { ...state, confirmation: action.value };
    case "reset":
      return EMPTY_SELECTION;
  }
}

export function BackupRestoreSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selection, dispatchSelection] = useReducer(selectionReducer, EMPTY_SELECTION);
  const { fileName: backupFileName, payload: backupPayload, confirmation: restoreConfirmation } = selection;
  const [notice, setNotice] = useState<Notice | null>(null);

  const canRestore =
    backupPayload !== null &&
    restoreConfirmation === RESTORE_CONFIRMATION &&
    !isRestoring;

  async function handleCreateBackup() {
    setIsBackingUp(true);
    setNotice(null);

    const response = await adminApi.createBackup();
    setIsBackingUp(false);

    if (!response.success) {
      setNotice({ kind: "error", text: response.error.message });
      return;
    }

    downloadBackup(response.data);
    setNotice({ kind: "message", text: "Backup downloaded. Keep this JSON file somewhere safe." });
  }

  async function handleBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    dispatchSelection({ type: "setFile", fileName: file.name, payload: null });
    setNotice(null);

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isBackupPayload(parsed)) {
        throw new Error("This does not look like a Talvyn backup JSON file.");
      }
      dispatchSelection({ type: "setFile", fileName: file.name, payload: parsed });
      setNotice({ kind: "message", text: `Backup ready: ${file.name}` });
    } catch (err) {
      dispatchSelection({ type: "clearFile" });
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not read backup file.",
      });
    } finally {
      event.target.value = "";
    }
  }

  async function handleRestore() {
    if (!canRestore || !backupPayload) return;

    setIsRestoring(true);
    setNotice(null);

    const response = await adminApi.restoreData(restoreConfirmation, backupPayload);
    setIsRestoring(false);

    if (!response.success) {
      setNotice({ kind: "error", text: response.error.message });
      return;
    }

    dispatchSelection({ type: "reset" });
    setNotice({ kind: "restored", result: response.data });
  }

  const restoreResult = notice?.kind === "restored" ? notice.result : null;
  const restoredTotal = restoreResult
    ? Object.values(restoreResult.restored_counts).reduce(
        (sum, count) => sum + count,
        0
      )
    : 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
          <DatabaseBackup className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Backup &amp; Restore
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Download a JSON backup of job descriptions, tests, candidates,
            results, links, invitations, and uploaded JD files. Admin users are
            not included.
          </p>
        </div>
      </div>

      {notice?.kind === "message" && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs font-medium text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
          {notice.text}
        </div>
      )}

      {restoreResult && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {restoreResult.message}
          </div>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            Restored {restoredTotal} database records and{" "}
            {restoreResult.restored_files} uploaded files.
          </p>
        </div>
      )}

      {notice?.kind === "error" && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {notice.text}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          loading={isBackingUp}
          leftIcon={<Download className="h-4 w-4" />}
          onClick={handleCreateBackup}
        >
          Create backup
        </Button>
        <Button
          type="button"
          variant="secondary"
          leftIcon={<Upload className="h-4 w-4" />}
          onClick={() => fileInputRef.current?.click()}
          disabled={isRestoring}
        >
          Choose backup file
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleBackupFile}
      />

      {backupFileName && (
        <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
          <p className="mb-3 text-xs font-medium text-slate-600 dark:text-slate-400">
            Selected file: <span className="font-semibold text-slate-900 dark:text-slate-100">{backupFileName}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input
              label='Type "RESTORE BACKUP" to confirm'
              value={restoreConfirmation}
              onChange={(event) =>
                dispatchSelection({ type: "setConfirmation", value: event.target.value })
              }
              placeholder={RESTORE_CONFIRMATION}
              disabled={isRestoring}
            />
            <Button
              type="button"
              variant="danger"
              loading={isRestoring}
              disabled={!canRestore}
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={handleRestore}
            >
              Restore backup
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
