/**
 * Upload ⇄ Generate switch for creating a job description.
 */
"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Upload, Sparkles } from "lucide-react";
import { JdUploadForm } from "@/components/admin/JdUploadForm";
import { JdGenerateForm } from "@/components/admin/JdGenerateForm";

type Mode = "upload" | "generate";

export function JdCreateTabs() {
  const [mode, setMode] = useState<Mode>("upload");
  return (
    <div>
      <div
        role="tablist"
        aria-label="Create a job description"
        className="mb-6 inline-flex rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "upload"}
          onClick={() => setMode("upload")}
          className={clsx(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
            mode === "upload"
              ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          )}
        >
          <Upload className="h-4 w-4" />
          Upload Job Description
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "generate"}
          onClick={() => setMode("generate")}
          className={clsx(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
            mode === "generate"
              ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Generate with AI
        </button>
      </div>

      {mode === "upload" ? <JdUploadForm /> : <JdGenerateForm />}
    </div>
  );
}
