"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { extractTextClientSide } from "@/lib/wasm/jdParser";

const MAX_MB = 10;

type Phase = "idle" | "reading" | "uploading";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [phase, setPhase] = useState<Phase>("idle");

  const pick = (f: File | null) => {
    setFailure(undefined);
    if (f && !/\.(pdf|docx)$/i.test(f.name)) return setFileError("Choose a PDF or Word (.docx) file.");
    if (f && f.size > MAX_MB * 1024 * 1024) return setFileError(`This file is larger than ${MAX_MB} MB.`);
    setFileError(undefined);
    setFile(f);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setFileError("Choose a file to upload.");
    setFailure(undefined);
    // Read the text in the browser first (WASM). If that fails, the server parses it instead.
    setPhase("reading");
    const text = await extractTextClientSide(file);
    setPhase("uploading");
    const body = new FormData();
    body.append("file", file, file.name);
    if (text) body.append("extracted_text", text);
    try {
      const res = await fetch("/api/jd/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.id) {
        setPhase("idle");
        return setFailure(data?.error?.message ?? "The upload didn't go through. Try again.");
      }
      router.push(`/dashboard/jds/${data.id}`);
    } catch {
      setPhase("idle");
      setFailure("You appear to be offline. Check your connection and try again.");
    }
  }

  const busy = phase !== "idle";
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {failure && <Alert tone="danger" title="Upload failed">{failure}</Alert>}
      <FileDrop accept=".pdf,.docx" hint={`PDF or Word (.docx), up to ${MAX_MB} MB`} file={file} onFile={pick} error={fileError} disabled={busy} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">You can review and edit the extracted text before skills are analysed.</p>
        <Button type="submit" variant="primary" loading={busy} disabled={!file}>
          {phase === "reading" ? "Reading file" : phase === "uploading" ? "Uploading" : "Upload and continue"}
        </Button>
      </div>
    </form>
  );
}
