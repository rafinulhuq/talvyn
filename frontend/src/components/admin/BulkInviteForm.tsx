/**
 * BulkInviteForm
 *
 * Accepts a CSV file (drag-and-drop or file picker), parses it client-side,
 * shows a preview table, then POSTs to /api/v1/invitations/bulk.
 *
 * CSV format (columns: email, name — name is optional):
 *   email,name
 *   jane@example.com,Jane Smith
 *   bob@example.com
 *
 * Handles comma and semicolon delimiters, optional header row, and
 * basic double-quote wrapping.  Max 50 rows per batch.
 */

"use client";

import { useId, useRef, useState } from "react";
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  SkipForward,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { invitationsApi } from "@/lib/api/invitations";
import type { TestSummary } from "@/types/test";
import type { BulkInviteResponse, BulkInviteRowResult } from "@/types/invitation";

// ── CSV parser ────────────────────────────────────────────────

const MAX_ROWS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParsedRow {
  email: string;
  name: string;
  valid: boolean;
  error?: string;
}

function parseCell(s: string): string {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s.trim();
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const delim = lines[0].includes(";") ? ";" : ",";

  // Detect column positions from the header row, if present.
  const firstCells = lines[0].split(delim).map(parseCell).map((c) => c.toLowerCase());
  const emailColInHeader = firstCells.findIndex((c) => c === "email" || c === "e-mail");
  const hasHeader = emailColInHeader !== -1;
  const startIdx = hasHeader ? 1 : 0;
  const emailCol = hasHeader ? emailColInHeader : 0;
  const nameCol = hasHeader ? firstCells.findIndex((c) => c === "name") : 1;

  const seen = new Set<string>();
  const rows: ParsedRow[] = [];

  for (let i = startIdx; i < lines.length && rows.length < MAX_ROWS; i++) {
    const cells = lines[i].split(delim).map(parseCell);
    const rawEmail = cells[emailCol] ?? "";
    if (!rawEmail) continue;

    const email = rawEmail.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    const name = (nameCol !== -1 ? cells[nameCol] : "") || email.split("@")[0];
    const valid = EMAIL_RE.test(email);
    rows.push({ email, name, valid, error: valid ? undefined : "Invalid email address" });
  }

  return rows;
}

// ── Types ─────────────────────────────────────────────────────

interface BulkInviteFormProps {
  jdId: string;
  approvedTests: TestSummary[];
}

type UIState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "done"; result: BulkInviteResponse }
  | { phase: "error"; message: string };

// ── Component ─────────────────────────────────────────────────

export function BulkInviteForm({ jdId, approvedTests }: BulkInviteFormProps) {
  const testSelectId = useId();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selectedTestId, setSelectedTestId] = useState("__all__");
  const [ui, setUi] = useState<UIState>({ phase: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setUi({ phase: "error", message: "Please upload a .csv file." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setUi({ phase: "error", message: "No valid rows found in the CSV." });
      } else {
        setRows(parsed);
        if (ui.phase === "error") setUi({ phase: "idle" });
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleSend() {
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0 || approvedTests.length === 0) return;

    setUi({ phase: "sending" });

    const result = await invitationsApi.bulkInvite({
      jd_id: jdId,
      ...(selectedTestId !== "__all__" ? { test_id: selectedTestId } : {}),
      candidates: validRows.map((r) => ({
        candidate_email: r.email,
        candidate_name: r.name,
      })),
    });

    if (!result.success) {
      const msg = result.error.message ?? "Bulk invite failed. Please try again.";
      setUi({ phase: "error", message: msg });
      return;
    }
    setUi({ phase: "done", result: result.data });
  }

  function reset() {
    setRows([]);
    setUi({ phase: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);
  const isLoading = ui.phase === "sending";

  // ── Done state ────────────────────────────────────────────────
  if (ui.phase === "done") {
    const { result } = ui;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Bulk Invite Complete</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={`${result.sent} Sent`} color="green" />
            {result.skipped > 0 && (
              <StatusPill label={`${result.skipped} Skipped`} color="yellow" />
            )}
            {result.failed > 0 && (
              <StatusPill label={`${result.failed} Failed`} color="red" />
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
            Results Per Candidate
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.results.map((row) => (
              <ResultRow key={row.email} row={row} />
            ))}
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={reset}>
          Import another CSV
        </Button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* Drop zone */}
      <button
        type="button"
        aria-label="Upload CSV file"
        className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 cursor-pointer shadow-xs transition-all hover:border-indigo-400 hover:bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-600 dark:hover:bg-slate-800/40 ${
          isDragging ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-xs dark:bg-indigo-950/70 dark:text-indigo-400">
          <Upload className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Drop CSV here or click to browse
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Columns: <span className="font-semibold text-slate-800 dark:text-slate-200">[email, name]</span> — name is optional. Max {MAX_ROWS} rows.
          </p>
        </div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {/* Error banner */}
      {ui.phase === "error" && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="flex-1 text-xs font-medium">{ui.message}</p>
          <button
            type="button"
            onClick={() => setUi({ phase: "idle" })}
            className="text-rose-600 hover:opacity-75 transition-opacity"
            aria-label="Dismiss bulk invite error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {rows.length} row{rows.length !== 1 ? "s" : ""} parsed
                  {invalidRows.length > 0 && (
                    <span className="ml-1.5 text-rose-600 dark:text-rose-400 font-medium">
                      ({invalidRows.length} invalid)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Clear CSV preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {rows.map((row) => (
                <div key={row.email} className="flex items-center gap-3 px-4 py-2.5">
                  {row.valid ? (
                    <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertCircle
                      className="h-3.5 w-3.5 shrink-0 text-rose-600"
                      aria-label={row.error}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-800 dark:text-slate-200">
                    {row.email}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{row.name}</span>
                  {!row.valid && (
                    <span className="shrink-0 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{row.error}</span>
                  )}
                </div>
              ))}
            </div>

            {invalidRows.length > 0 && (
              <div className="border-t border-rose-100 bg-rose-50/50 px-4 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                Notice: {invalidRows.length} invalid row{invalidRows.length !== 1 ? "s" : ""} will be skipped automatically.
              </div>
            )}
          </div>

          {/* Test selector — shown only when there are multiple approved tests */}
          {approvedTests.length > 1 && (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <label htmlFor={testSelectId} className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Test to include
              </label>
              <select
                id={testSelectId}
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
                disabled={isLoading}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="__all__">All approved tests ({approvedTests.length})</option>
                {approvedTests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            loading={isLoading}
            disabled={validRows.length === 0 || approvedTests.length === 0}
            leftIcon={<Send className="h-4 w-4" />}
            size="lg"
            className="w-full"
            onClick={handleSend}
          >
            {isLoading
              ? "Sending invitations…"
              : `Send ${validRows.length} invitation${validRows.length !== 1 ? "s" : ""}`}
          </Button>
        </>
      )}

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        CSV format: [email, name] — one candidate per row. Max {MAX_ROWS} candidates per batch.
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatusPill({ label, color }: { label: string; color: "green" | "yellow" | "red" }) {
  const cls = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400",
    yellow: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400",
    red: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400",
  }[color];
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
  );
}

function ResultRow({ row }: { row: BulkInviteRowResult }) {
  const icon =
    row.status === "sent" ? (
      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    ) : row.status === "skipped" ? (
      <SkipForward className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    ) : (
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
    );

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-xs">
      {icon}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-800 dark:text-slate-200">
        {row.email}
      </span>
      {row.status === "sent" && !row.email_sent && (
        <span className="shrink-0 text-[11px] font-semibold text-rose-600 dark:text-rose-400">email failed</span>
      )}
      {row.error && row.status !== "sent" && (
        <span className="shrink-0 max-w-[45%] truncate text-[11px] font-medium text-slate-500">
          {row.error}
        </span>
      )}
    </div>
  );
}
