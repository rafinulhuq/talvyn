"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { FileDrop } from "@/components/ui/file-drop";
import { Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractTextClientSide } from "@/lib/wasm/jdParser";

export const MAX_DOC_CHARS = 80_000;
export type Doc = { text: string; name: string | null; method: "native" | "ocr" };
export const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/**
 * Paste text or upload a file. PDF and DOCX are read in the browser first
 * (WASM parser); if that finds no text, the server tries (and, for résumés, OCR).
 * Text and Markdown are read as-is.
 */
export function DocumentInput({ doc, onChange, extractPath, placeholder, minWords }: { doc: Doc; onChange: (d: Doc) => void; extractPath: string; placeholder: string; minWords: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);
  const [tab, setTab] = useState("paste");

  async function pick(f: File | null) {
    setFile(f);
    setError(undefined);
    if (!f) return onChange({ text: "", name: null, method: "native" });
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "docx", "txt", "md"].includes(ext)) return setError("Upload a PDF, Word (.docx), text or Markdown file.");
    if (f.size > 10 * 1024 * 1024) return setError("That file is larger than 10 MB.");
    setReading(true);
    let text: string | null = null;
    let method: Doc["method"] = "native";
    if (ext === "txt" || ext === "md") text = (await f.text()).trim() || null;
    else {
      text = await extractTextClientSide(f);
      if (!text) {
        const form = new FormData();
        form.append("file", f);
        const res = await fetch(extractPath, { method: "POST", body: form, credentials: "same-origin" }).catch(() => null);
        const body = (await res?.json().catch(() => null)) as { text?: string; extraction_method?: "native" | "ocr"; error?: { message?: string } } | null;
        if (res?.ok && body?.text) {
          text = body.text;
          method = body.extraction_method ?? "native";
        } else if (body?.error?.message) {
          setReading(false);
          return setError(body.error.message);
        }
      }
    }
    setReading(false);
    if (!text?.trim()) return setError("No text could be read from this file. If it's a scan, export a real PDF from your word processor, or paste the text.");
    onChange({ text: text.slice(0, MAX_DOC_CHARS), name: f.name, method });
    setTab("paste");
  }

  const n = words(doc.text);
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
          <TabsTrigger value="upload">Upload a file</TabsTrigger>
        </TabsList>
        <TabsContent value="paste">
          <Textarea
            aria-label="Document text"
            rows={14}
            maxLength={MAX_DOC_CHARS}
            placeholder={placeholder}
            value={doc.text}
            onChange={(e) => onChange({ text: e.target.value, name: null, method: "native" })}
          />
          <p className="mt-2 flex justify-between text-sm text-ink-muted">
            <span>
              {doc.name ? `From ${doc.name}. ` : ""}
              {n} {n === 1 ? "word" : "words"}
              {n > 0 && n < minWords ? `, at least ${minWords} needed` : ""}
            </span>
            <span>
              {doc.text.length.toLocaleString("en")} of {MAX_DOC_CHARS.toLocaleString("en")} characters
            </span>
          </p>
        </TabsContent>
        <TabsContent value="upload">
          <FileDrop accept=".pdf,.docx,.txt,.md" hint={reading ? "Reading the file" : "PDF, Word, text or Markdown, up to 10 MB"} file={file} onFile={(f) => void pick(f)} error={error} disabled={reading} />
        </TabsContent>
      </Tabs>
      {doc.method === "ocr" && <Alert>This file had no text layer, so it was read with OCR. Most applicant tracking systems can&apos;t do that; the report reflects it.</Alert>}
    </div>
  );
}
