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
        className="mb-6 inline-flex rounded-xl border border-white/10 bg-[#181A1F] p-1 shadow-2xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "upload"}
          onClick={() => setMode("upload")}
          className={clsx(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
            mode === "upload"
              ? "bg-[#F2D74E] text-[#1A1600] shadow-xs"
              : "text-white/80 hover:text-white hover:bg-white/10"
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
              ? "bg-[#F2D74E] text-[#1A1600] shadow-xs"
              : "text-white/80 hover:text-white hover:bg-white/10"
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
