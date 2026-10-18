import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { atsApi } from "@/lib/api/ats";
import { jdApi } from "@/lib/api/jd";
import { extractTextClientSide } from "@/lib/wasm/jdParser";
import type { ATSCheckResponse, ATSExtractionMethod } from "@/types/ats";
import type { JobDescriptionListItem } from "@/types/jd";

export const MAX_TEXT_CHARS = 80_000;
const MAX_FILE_SIZE_MB = 10;
// Matches the backend's ATSCheckRequest validator, so the button is disabled
// rather than the request coming back as a 422.
export const MIN_WORDS = 30;
const JD_PAGE_SIZE = 100;

export const SAMPLE_RESUME = `Priya Raman
Bangalore, India
priya.raman@example.com | +91 98765 43210
linkedin.com/in/priyaraman | github.com/priyaraman

Professional Summary
Backend engineer with eight years building payment infrastructure at scale,
spanning settlement, fraud scoring, and merchant onboarding.

Work Experience

Staff Engineer, PayLoop
Mar 2021 - Present
- Redesigned the settlement pipeline, cutting reconciliation time from 6 hours to 22 minutes.
- Migrated 140 services from Python 3.8 to 3.12 with zero customer-facing downtime.
- Reduced infrastructure spend by 38% through workload right-sizing.
- Mentored 5 engineers, three of whom were promoted within the year.

Senior Engineer, Fintrace
Jun 2017 - Feb 2021
- Built a fraud-scoring service handling 12,000 requests per second at p99 of 40ms.
- Automated the release pipeline, taking deploys from weekly to 30 per day.
- Introduced contract testing across 9 teams, reducing integration incidents by 60%.

Education

B.Tech, Computer Science, IIT Madras
2013 - 2017

Skills
Python, Go, PostgreSQL, Kafka, Kubernetes, Docker, Terraform, AWS, Redis

Certifications
AWS Certified Solutions Architect, 2022`;

export type CheckState =
  | { phase: "idle" }
  | { phase: "extracting"; filename: string }
  | { phase: "checking" }
  | { phase: "error"; message: string; detail?: string }
  | { phase: "done" };

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// The resume being checked — mode, text, its file metadata, and the last
// result/notice — is one thing that gets replaced or cleared as a unit at
// every entry point (pick a file, paste text, load the sample, hit reset).
// Grouping it means each of those call sites can't forget to clear a field
// the way six separate setters scattered across the component could.
type DocumentState = {
  mode: "paste" | "upload";
  text: string;
  sourceName: string | null;
  sourceSize: number | null;
  extractionMethod: ATSExtractionMethod | null;
  result: ATSCheckResponse | null;
  notice: string | null;
};

const INITIAL_DOCUMENT: DocumentState = {
  mode: "upload",
  text: "",
  sourceName: null,
  sourceSize: null,
  extractionMethod: null,
  result: null,
  notice: null,
};

export type DocumentAction =
  | { type: "setMode"; mode: "paste" | "upload" }
  | { type: "editText"; value: string }
  | { type: "clearOutputs" }
  | { type: "clearResult" }
  | { type: "setResult"; result: ATSCheckResponse }
  | { type: "setNotice"; message: string }
  | {
      type: "loadedFile";
      text: string;
      sourceName: string;
      sourceSize: number | null;
      extractionMethod: ATSExtractionMethod;
    }
  | { type: "clearFileMeta" }
  | { type: "reset" }
  | { type: "loadSample"; text: string; sourceName: string; extractionMethod: ATSExtractionMethod };

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
        extractionMethod: null,
        result: null,
        notice: null,
      };
    case "clearOutputs":
      return { ...state, result: null, notice: null };
    case "clearResult":
      return { ...state, result: null };
    case "setResult":
      return { ...state, result: action.result };
    case "setNotice":
      return { ...state, notice: action.message };
    case "loadedFile":
      return {
        ...state,
        mode: "paste",
        text: action.text,
        sourceName: action.sourceName,
        sourceSize: action.sourceSize,
        extractionMethod: action.extractionMethod,
      };
    case "clearFileMeta":
      return { ...state, sourceName: null, sourceSize: null, extractionMethod: null };
    case "reset":
      return {
        ...state,
        text: "",
        sourceName: null,
        sourceSize: null,
        extractionMethod: null,
        result: null,
        notice: null,
      };
    case "loadSample":
      return {
        ...state,
        mode: "paste",
        text: action.text,
        sourceName: action.sourceName,
        sourceSize: null,
        extractionMethod: action.extractionMethod,
        result: null,
        notice: null,
      };
  }
}

export function useAtsCheckerFlow() {
  const [doc, dispatchDoc] = useReducer(documentReducer, INITIAL_DOCUMENT);
  const [isDragOver, setIsDragOver] = useState(false);
  const [state, setState] = useState<CheckState>({ phase: "idle" });

  const [jds, setJds] = useState<JobDescriptionListItem[]>([]);
  const [selectedJdId, setSelectedJdId] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards against a stale response overwriting a newer run's result when the
  // user changes the input and re-checks before the first call returns.
  const activeRunRef = useRef(0);

  const words = useMemo(() => wordCount(doc.text), [doc.text]);
  const canCheck = words >= MIN_WORDS && state.phase !== "checking";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await jdApi.list(1, JD_PAGE_SIZE);
      if (cancelled || !res.success) return;
      // Only JDs that have been analyzed carry extracted skills; the rest
      // would 422 on /check, so they are not offered.
      setJds(res.data.items.filter((item) => item.job_title));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file: File) {
    activeRunRef.current += 1;
    dispatchDoc({ type: "clearOutputs" });

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setState({
        phase: "error",
        message: `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`,
      });
      return;
    }

    setState({ phase: "extracting", filename: file.name });

    const ext = file.name.split(".").pop()?.toLowerCase();
    let extracted: string | null = null;
    let method: ATSExtractionMethod = "native";

    if (ext === "txt" || ext === "md") {
      extracted = (await file.text()).trim() || null;
    } else if (ext === "pdf" || ext === "docx") {
      extracted = await extractTextClientSide(file);
      if (!extracted) {
        // The WASM parser's contract is "null means fall back", not "error".
        // The server path also runs OCR, which is how a scanned resume gets
        // identified as one rather than just failing to extract.
        const server = await atsApi.extractText(file);
        if (!server.success) {
          setState({
            phase: "error",
            message: server.error.message,
            detail: server.error.code,
          });
          return;
        }
        extracted = server.data.text;
        method = server.data.extraction_method;
        if (method === "ocr") {
          dispatchDoc({
            type: "setNotice",
            message:
              "This file had no text layer, so it was read with OCR. That is exactly what an ATS cannot do — see the report.",
          });
        }
      }
    } else {
      setState({
        phase: "error",
        message: "Unsupported file type. Upload a PDF, DOCX, TXT, or Markdown file.",
      });
      return;
    }

    if (!extracted || !extracted.trim()) {
      setState({
        phase: "error",
        message:
          "No text could be read from this file. If it is a scanned image, export a real PDF from your word processor instead.",
      });
      return;
    }

    dispatchDoc({
      type: "loadedFile",
      text: extracted.slice(0, MAX_TEXT_CHARS),
      sourceName: file.name,
      sourceSize: file.size,
      extractionMethod: method,
    });
    setState({ phase: "idle" });
  }

  async function runCheck() {
    if (!canCheck) return;
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;

    setState({ phase: "checking" });
    dispatchDoc({ type: "clearResult" });

    const res = await atsApi.check({
      text: doc.text,
      filename: doc.sourceName,
      extraction_method: doc.extractionMethod,
      jd_id: selectedJdId || null,
    });

    if (activeRunRef.current !== runId) return;

    if (!res.success) {
      setState({ phase: "error", message: res.error.message, detail: res.error.code });
      return;
    }

    dispatchDoc({ type: "setResult", result: res.data });
    setState({ phase: "done" });
  }

  function reset() {
    activeRunRef.current += 1;
    dispatchDoc({ type: "reset" });
    setState({ phase: "idle" });
  }

  function loadSample() {
    activeRunRef.current += 1;
    dispatchDoc({
      type: "loadSample",
      text: SAMPLE_RESUME,
      sourceName: "sample-resume.pdf",
      extractionMethod: "native",
    });
    setState({ phase: "idle" });
  }

  return {
    doc,
    dispatchDoc,
    isDragOver,
    setIsDragOver,
    state,
    setState,
    jds,
    selectedJdId,
    setSelectedJdId,
    fileInputRef,
    words,
    canCheck,
    handleFile,
    runCheck,
    reset,
    loadSample,
  };
}
