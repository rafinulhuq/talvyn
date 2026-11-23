"use client";

import { DatabaseBackup, Download, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FileDrop } from "@/components/ui/file-drop";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";

const RESTORE_PHRASE = "RESTORE BACKUP";
const RESET_PHRASE = "DELETE ALL";
const MAX_RESTORE = 50 * 1024 * 1024; // the proxy's limit for /admin/restore-data

const total = (counts: Record<string, number>) => Object.values(counts ?? {}).reduce((a, b) => a + b, 0);

export function DataTools() {
  const router = useRouter();
  const [backingUp, setBackingUp] = useState(false);
  const [dialog, setDialog] = useState<"restore" | "reset" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function backup() {
    setBackingUp(true);
    const res = await api<unknown>("/api/v1/admin/backup");
    setBackingUp(false);
    if (!res.ok) return toast({ title: "Backup failed", description: res.error.message, tone: "danger" });
    const url = URL.createObjectURL(new Blob([JSON.stringify(res.data)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `talvyn-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast({ title: "Backup downloaded", description: "Store it somewhere safe. It contains candidate data." });
  }

  function close() {
    setDialog(null);
    setPhrase("");
    setFile(null);
    setError(undefined);
    setFileError(undefined);
  }

  async function restore() {
    if (!file) return setFileError("Choose a backup file.");
    if (file.size > MAX_RESTORE) return setFileError("Backups over 50 MB can't be restored here.");
    let backup: unknown;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      return setFileError("This isn't a Talvyn backup file.");
    }
    setBusy(true);
    setError(undefined);
    const res = await api<{ restored_counts: Record<string, number>; restored_files: number }>("/api/v1/admin/restore-data", { method: "POST", body: { confirm: RESTORE_PHRASE, backup } });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    close();
    toast({ title: "Backup restored", description: `${total(res.data.restored_counts)} records and ${res.data.restored_files} files restored.`, tone: "success" });
    router.refresh();
  }

  async function reset() {
    setBusy(true);
    setError(undefined);
    const res = await api<{ deleted_counts: Record<string, number>; deleted_files: number }>("/api/v1/admin/reset-data", { method: "POST", body: { confirm: RESET_PHRASE } });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    close();
    toast({ title: "Hiring data deleted", description: `${total(res.data.deleted_counts)} records and ${res.data.deleted_files} files removed.` });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Backup" description="Job descriptions, tests, candidates, results, exam templates and website content, plus uploaded files, in one JSON file. User accounts aren't included.">
        <Button variant="secondary" loading={backingUp} onClick={() => void backup()}>
          <Download aria-hidden className="size-4" /> Download a backup
        </Button>
      </Panel>
      <Panel title="Restore" description="Replaces the current hiring data with a backup. User accounts aren't touched.">
        <Button variant="secondary" onClick={() => setDialog("restore")}>
          <RotateCcw aria-hidden className="size-4" /> Restore from a backup
        </Button>
      </Panel>
      <section className="rounded-panel border border-danger/30 bg-surface p-5">
        <h2 className="text-base font-medium text-ink">Delete all hiring data</h2>
        <p className="mt-1 max-w-2xl text-base text-ink-muted">Removes every job description, test, invitation, candidate, result and exam template, and their files. User accounts and website content are kept. This can&apos;t be undone, so download a backup first.</p>
        <Button className="mt-4" variant="danger" onClick={() => setDialog("reset")}>
          <Trash2 aria-hidden className="size-4" /> Delete all hiring data
        </Button>
      </section>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && !busy && close()}>
        {dialog === "restore" ? (
          <DialogContent
            title="Restore from a backup"
            description="Current hiring data is replaced by what's in the file."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost" disabled={busy}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button variant="danger" disabled={phrase !== RESTORE_PHRASE || !file} loading={busy} onClick={() => void restore()}>
                  <DatabaseBackup aria-hidden className="size-4" /> Restore
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <FileDrop accept=".json,application/json" hint="Talvyn backup, .json" file={file} onFile={(f) => (setFile(f), setFileError(undefined))} error={fileError} />
              <Field label={`Type ${RESTORE_PHRASE} to confirm`}>
                <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
              </Field>
              {error && <Alert tone="danger">{error}</Alert>}
            </div>
          </DialogContent>
        ) : dialog === "reset" ? (
          <DialogContent
            title="Delete all hiring data?"
            description="Every job description, test, invitation, candidate, result and exam template is deleted for good. User accounts and website content are kept."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost" disabled={busy}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button variant="danger" disabled={phrase !== RESET_PHRASE} loading={busy} onClick={() => void reset()}>
                  Delete everything
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <Field label={`Type ${RESET_PHRASE} to confirm`}>
                <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
              </Field>
              {error && <Alert tone="danger">{error}</Alert>}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
