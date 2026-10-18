import { useMemo, useReducer, useRef, useState } from "react";
import { aiCheckerApi } from "@/lib/api/aiChecker";
import { extractTextClientSide } from "@/lib/wasm/jdParser";
import type { AICheckResponse } from "@/types/aiChecker";

export const MAX_TEXT_CHARS = 80_000;
export const MAX_FILE_SIZE_MB = 10;
export const MIN_WORDS = 20;
const CHECK_POLL_INTERVAL_MS = 2_000;
const CHECK_MAX_POLLS = 180;

export const SAMPLES = {
  human: `Over the past four years as a frontend engineer at BuildFlow, I led our migration from a legacy single-page app to Next.js with App Router. The hardest part wasn't the React Server Components—it was untangling our state management where Redux and custom event emitters had grown intertwined. We reduced our bundle size by 42% and dropped our median Largest Contentful Paint from 3.8s down to 1.1s on mobile 4G networks.`,
  ai: `In today's fast-paced digital landscape, frontend engineering plays a pivotal role in ensuring seamless user interactions. As an experienced developer, I possess a robust understanding of modern web architectures, including Next.js and React Server Components. Furthermore, my proficiency in performance optimization enables me to deliver scalable, cutting-edge solutions that drive significant business outcomes while adhering to industry best practices.`,
};

export type CheckState =
  | { phase: "idle" }
  | { phase: "extracting"; filename: string }
  | { phase: "checking"; detail?: string; step?: number }
  | { phase: "error"; message: string; detail?: string }
  | { phase: "done" };

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function extractTextFromFile(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt" || ext === "md") {
    return (await file.text()).trim() || null;
  }
  if (ext === "pdf" || ext === "docx") {
    return extractTextClientSide(file);
  }
  return null;
}

// The document being checked — mode, text, its file metadata, and the last
// result/notice — is one thing that gets replaced or cleared as a unit at
// every entry point (pick a file, paste text, load a sample, hit reset).
// Grouping it means each of those call sites can't forget to clear a field
// the way five separate setters scattered across the component could.
type DocumentState = {
  mode: "paste" | "upload";
  text: string;
  sourceName: string | null;
  sourceSize: number | null;
  result: AICheckResponse | null;
  selectedPhrase: string | null;
  notice: string | null;
};

const INITIAL_DOCUMENT: DocumentState = {
  mode: "paste",
  text: "",
  sourceName: null,
  sourceSize: null,
  result: null,
  selectedPhrase: null,
  notice: null,
};

export type DocumentAction =
  | { type: "setMode"; mode: "paste" | "upload" }
  | { type: "editText"; value: string }
  | { type: "clearOutputs" }
  | { type: "clearResult" }
  | { type: "setResult"; result: AICheckResponse }
  | { type: "selectPhrase"; phrase: string | null }
  | { type: "loadedFile"; text: string; sourceName: string; sourceSize: number; notice: string | null }
  | { type: "clearFileMeta" }
  | { type: "reset" }
  | { type: "loadSample"; text: string };

function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case "setMode":
      return { ...state, mode: action.mode };
    case "editText":
      return {
        ...state,
        text: action.value,
        sourceName: null,
        sourceSize: null,
        result: null,
        selectedPhrase: null,
        notice: null,
      };
    case "clearOutputs":
      return { ...state, result: null, selectedPhrase: null, notice: null };
    case "clearResult":
      return { ...state, result: null, selectedPhrase: null };
    case "setResult":
      return { ...state, result: action.result };
    case "selectPhrase":
      return { ...state, selectedPhrase: action.phrase };
    case "loadedFile":
      return {
        ...state,
        mode: "paste",
        text: action.text,
        sourceName: action.sourceName,
        sourceSize: action.sourceSize,
        notice: action.notice,
      };
    case "clearFileMeta":
      return { ...state, sourceName: null, sourceSize: null };
    case "reset":
      return {
        ...state,
        text: "",
        sourceName: null,
        sourceSize: null,
        result: null,
        selectedPhrase: null,
        notice: null,
      };
    case "loadSample":
      return {
        ...state,
        mode: "paste",
        text: action.text,
        sourceName: null,
        sourceSize: null,
        result: null,
        selectedPhrase: null,
        notice: null,
      };
  }
}

export function useAiCheckerFlow() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRunRef = useRef(0);
  const [doc, dispatchDoc] = useReducer(documentReducer, INITIAL_DOCUMENT);
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);

  const words = useMemo(() => wordCount(doc.text), [doc.text]);
  const canCheck = words >= MIN_WORDS && doc.text.length <= MAX_TEXT_CHARS;

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setState({
        phase: "error",
        message: `Keep files under ${MAX_FILE_SIZE_MB}MB for the AI checker.`,
      });
      return;
    }

    dispatchDoc({ type: "clearOutputs" });
    setState({ phase: "extracting", filename: file.name });

    let extracted = await extractTextFromFile(file);
    let fallbackError: { code: string; message: string } | null = null;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!extracted && (ext === "pdf" || ext === "docx")) {
      const fallback = await aiCheckerApi.extractText(file);
      if (fallback.success) {
        extracted = fallback.data.text;
      } else {
        fallbackError = fallback.error;
      }
    }

    if (!extracted) {
      setState({
        phase: "error",
        message:
          fallbackError?.message ??
          "Could not extract readable text from this file. Try a PDF/DOCX with selectable text, or paste the document text directly.",
        detail: fallbackError?.code,
      });
      return;
    }

    const clipped = extracted.slice(0, MAX_TEXT_CHARS);
    dispatchDoc({
      type: "loadedFile",
      text: clipped,
      sourceName: file.name,
      sourceSize: file.size,
      notice:
        extracted.length > MAX_TEXT_CHARS
          ? "Document text was loaded, but only the first 80,000 characters will be checked."
          : null,
    });
    setState({ phase: "idle" });
  }

  async function runCheck() {
    if (!canCheck) return;
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;

    setState({ phase: "checking", detail: "Queueing AI checker job...", step: 1 });
    dispatchDoc({ type: "clearResult" });

    const queued = await aiCheckerApi.startCheckJob({
      text: doc.text,
      title: doc.sourceName,
    });

    if (activeRunRef.current !== runId) return;

    if (!queued.success) {
      setState({
        phase: "error",
        message: queued.error.message,
        detail: queued.error.code,
      });
      return;
    }

    setState({
      phase: "checking",
      detail: queued.data.detail || "Waiting for the AI worker...",
      step: 2,
    });

    for (let poll = 0; poll < CHECK_MAX_POLLS; poll += 1) {
      await wait(poll === 0 ? 1_000 : CHECK_POLL_INTERVAL_MS);
      if (activeRunRef.current !== runId) return;

      const status = await aiCheckerApi.getCheckJob(queued.data.job_id);
      if (activeRunRef.current !== runId) return;

      if (!status.success) {
        setState({
          phase: "error",
          message: status.error.message,
          detail: status.error.code,
        });
        return;
      }

      setState({
        phase: "checking",
        detail: status.data.detail,
        step: poll > 1 ? 3 : 2,
      });

      if (status.data.status === "SUCCEEDED" && status.data.result) {
        dispatchDoc({ type: "setResult", result: status.data.result });
        setState({ phase: "done" });
        return;
      }

      if (status.data.status === "FAILED") {
        setState({
          phase: "error",
          message: status.data.error ?? status.data.detail,
          detail: "AI_CHECKER_JOB_FAILED",
        });
        return;
      }
    }

    setState({
      phase: "error",
      message:
        "AI checker is still running. Please try again in a moment with a shorter document, or check server worker logs.",
      detail: "AI_CHECKER_TIMEOUT",
    });
  }

  function reset() {
    activeRunRef.current += 1;
    dispatchDoc({ type: "reset" });
    setState({ phase: "idle" });
  }

  function loadSample(type: "human" | "ai") {
    activeRunRef.current += 1;
    dispatchDoc({ type: "loadSample", text: SAMPLES[type] });
    setState({ phase: "idle" });
  }

  return {
    doc,
    dispatchDoc,
    state,
    setState,
    isDragOver,
    setIsDragOver,
    fileInputRef,
    words,
    canCheck,
    handleFile,
    runCheck,
    reset,
    loadSample,
  };
}
