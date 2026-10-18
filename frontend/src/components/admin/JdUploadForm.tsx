/**
 * JD upload form with drag-and-drop support.
 * Accepts PDF and DOCX files. Shows upload progress and error states.
 *
 * On successful upload, polls the parse status every 2 seconds
 * and calls onSuccess when parsing completes.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Upload, FileText, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { jdApi } from "@/lib/api/jd";
import { extractTextClientSide } from "@/lib/wasm/jdParser";

type UploadState =
  | { phase: "idle" }
  | { phase: "dragging" }
  | { phase: "uploading"; progress: number }
  | { phase: "parsing"; jdId: string; filename: string }
  | { phase: "done"; jdId: string; filename: string }
  | { phase: "error"; title: string; message: string; detail?: string };

const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
const MAX_SIZE_MB = 10;

function uploadErrorCopy(error: {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): { title: string; message: string; detail?: string } {
  const fallback = error.message ?? "Upload failed. Please try again.";

  switch (error.code) {
    case "NO_FILE":
      return {
        title: "No file selected",
        message: "Choose a PDF or DOCX job description before uploading.",
      };
    case "EMPTY_FILE":
      return {
        title: "Empty file",
        message: "The selected file has no content. Export or download the JD again, then retry.",
      };
    case "INVALID_FILE_TYPE":
      return {
        title: "Unsupported file",
        message: "Upload a real PDF or DOCX file. Renamed or corrupted files are rejected.",
        detail: fallback,
      };
    case "FILE_TOO_LARGE":
      return {
        title: "File too large",
        message: `Keep the file under ${MAX_SIZE_MB}MB, or compress/export a smaller copy.`,
      };
    case "INVALID_MULTIPART_FORM":
      return {
        title: "Upload request could not be read",
        message: "The browser could not send the file correctly. Try again, or refresh the page.",
      };
    case "UPLOAD_BACKEND_UNAVAILABLE":
    case "NETWORK_ERROR":
      return {
        title: "Upload service unavailable",
        message: "The server could not be reached. Wait a few seconds and try again.",
        detail: fallback,
      };
    case "UPLOAD_PROXY_MISCONFIGURED":
      return {
        title: "Upload service misconfigured",
        message: "The frontend cannot reach the backend upload service. Check Settings -> Overview -> System Health.",
        detail: fallback,
      };
    case "UPLOAD_BACKEND_ERROR":
      return {
        title: "Server could not process the file",
        message: "The file reached the backend, but processing failed. Check server logs or try another export of the document.",
        detail: fallback,
      };
    default:
      return {
        title: "Upload failed",
        message: fallback,
      };
  }
}

function validateFile(file: File): string | null {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Invalid file type. Please upload a PDF or DOCX file.`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `File is too large. Maximum size is ${MAX_SIZE_MB}MB.`;
  }
  return null;
}

export function JdUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Without this, navigating away mid-"parsing" leaves the interval running
  // in the background — it keeps polling and calling setState/router.push
  // against a component that's no longer mounted/visible.
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // ── Upload handler ───────────────────────────────────────────
  async function handleFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setState({
        phase: "error",
        title: "File rejected",
        message: validationError,
      });
      return;
    }

    setState({ phase: "uploading", progress: 0 });

    // Try extracting text in the browser first (WASM PDF/DOCX parser). If it
    // succeeds, the backend skips its own parse job and marks the JD ready
    // immediately. If it fails or isn't supported, extractedText is null and
    // the backend falls back to its normal server-side parse + polling.
    const extractedText = await extractTextClientSide(file);

    const result = await jdApi.upload(file, extractedText);

    if (!result.success) {
      const copy = uploadErrorCopy(result.error);
      setState({
        phase: "error",
        ...copy,
      });
      return;
    }

    const { id: jdId, parse_status } = result.data;

    if (parse_status === "DONE") {
      // Already parsed client-side — no need to poll.
      setState({ phase: "done", jdId, filename: file.name });
      setTimeout(() => router.push(`/dashboard/jds/${jdId}`), 1200);
      return;
    }

    setState({ phase: "parsing", jdId, filename: file.name });

    // Start polling for parse status
    startPolling(jdId, file.name);
  }

  // ── Status polling ───────────────────────────────────────────
  function startPolling(jdId: string, filename: string) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      const result = await jdApi.getStatus(jdId);

      if (!result.success) return; // Transient error — keep polling

      const { parse_status } = result.data;

      if (parse_status === "DONE") {
        clearInterval(pollIntervalRef.current!);
        setState({ phase: "done", jdId, filename });
        // Redirect to JD detail after short delay
        setTimeout(() => router.push(`/dashboard/jds/${jdId}`), 1200);
      } else if (parse_status === "FAILED") {
        clearInterval(pollIntervalRef.current!);
        setState({
          phase: "error",
          title: "Text extraction failed",
          message:
            "Text extraction failed. The file may be corrupt, encrypted, or a scanned image without selectable text.",
          detail: "Try exporting the document again, or upload a version with selectable text.",
        });
      }
      // PENDING / PROCESSING → keep polling
    }, 2000);
  }

  // ── Drag & drop handlers ─────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((prev) =>
      prev.phase === "idle" ? { phase: "dragging" } : prev
    );
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((prev) =>
      prev.phase === "dragging" ? { phase: "idle" } : prev
    );
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  };

  const reset = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setState({ phase: "idle" });
  };

  // ── Render states ────────────────────────────────────────────
  return (
    <div className="w-full max-w-xl">
      {/* Drop zone */}
      {(state.phase === "idle" || state.phase === "dragging") && (
        <>
        <button
          type="button"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            "flex flex-col items-center justify-center gap-4",
            "rounded-2xl border-2 border-dashed p-12",
            "w-full text-center transition-all duration-200 cursor-pointer shadow-xs",
            state.phase === "dragging"
              ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
              : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60"
          )}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload job description file"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/60 shadow-xs">
            <Upload className="h-6 w-6" />
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {state.phase === "dragging"
                ? "Drop file to upload"
                : "Drop your file here"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              or{" "}
              <span className="font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 underline">browse files</span>
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              PDF or DOCX · Maximum {MAX_SIZE_MB}MB
            </p>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleInputChange}
          className="hidden"
        />
        </>
      )}

      {/* Uploading */}
      {state.phase === "uploading" && (
        <StatusCard
          icon={<FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
          title="Uploading Document..."
          description="Sending your document to the server"
        />
      )}

      {/* Parsing */}
      {state.phase === "parsing" && (
        <StatusCard
          icon={
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          }
          title="Extracting Skills & Requirements..."
          description={`Processing "${state.filename}"`}
        />
      )}

      {/* Done */}
      {state.phase === "done" && (
        <StatusCard
          icon={<CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          title="Extraction Complete"
          description={`"${state.filename}" is ready. Redirecting…`}
        />
      )}

      {/* Error */}
      {state.phase === "error" && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/80 p-5 shadow-xs dark:border-rose-900/40 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider">{state.title}</p>
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
              {state.detail && (
                <details className="mt-2 text-[11px] text-rose-700/80 dark:text-rose-300/80">
                  <summary className="cursor-pointer font-semibold">
                    View technical detail
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap">{state.detail}</p>
                </details>
              )}
            </div>
            <button
              onClick={reset}
              className="shrink-0 text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            className="mt-4 w-full border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300"
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Internal status card ──────────────────────────────────────

function StatusCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shadow-xs">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">{title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}
