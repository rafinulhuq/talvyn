import type { Dispatch, RefObject } from "react";
import { FileSearch, FileText, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MAX_TEXT_CHARS, MIN_WORDS, type DocumentAction } from "@/hooks/useAtsCheckerFlow";
import type { JobDescriptionListItem } from "@/types/jd";
import {
  ActiveFileBanner,
  DocumentModeTabs,
  DropzoneCanvas,
  WordCountStatus,
} from "@/components/admin/checkerStudio/DocumentInputParts";

const MAX_FILE_SIZE_MB = 10;

interface DocView {
  mode: "paste" | "upload";
  text: string;
  sourceName: string | null;
  sourceSize: number | null;
  result: unknown;
  notice: string | null;
}

interface Props {
  doc: DocView;
  dispatchDoc: Dispatch<DocumentAction>;
  checking: boolean;
  extracting: boolean;
  isDragOver: boolean;
  onDragOverChange: (over: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  words: number;
  canCheck: boolean;
  jds: JobDescriptionListItem[];
  selectedJdId: string;
  onSelectedJdIdChange: (id: string) => void;
  onFile: (file: File) => void;
  onRunCheck: () => void;
  onReset: () => void;
  onEditingIdle: () => void;
}

export function ResumeInputStudio({
  doc,
  dispatchDoc,
  checking,
  extracting,
  isDragOver,
  onDragOverChange,
  fileInputRef,
  words,
  canCheck,
  jds,
  selectedJdId,
  onSelectedJdIdChange,
  onFile,
  onRunCheck,
  onReset,
  onEditingIdle,
}: Props) {
  const { mode: inputMode, text, sourceName, sourceSize, result, notice } = doc;

  return (
    <section className="flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
      <DocumentModeTabs
        tabs={[
          { mode: "upload", label: "Upload Resume", icon: UploadCloud },
          { mode: "paste", label: "Paste Text", icon: FileText },
        ]}
        activeMode={inputMode}
        onModeChange={(mode) => dispatchDoc({ type: "setMode", mode })}
        showClear={Boolean(text || result)}
        onClear={onReset}
      />

      {sourceName && (
        <ActiveFileBanner
          sourceName={sourceName}
          sourceSize={sourceSize}
          onClear={() => dispatchDoc({ type: "clearFileMeta" })}
          showSizeWhenZero
        />
      )}

      {notice && (
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-2 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
          {notice}
        </div>
      )}

      <DropzoneCanvas
        isDragOver={isDragOver}
        onDragOverChange={onDragOverChange}
        onFile={onFile}
        fileInputRef={fileInputRef}
        accept=".pdf,.docx,.txt,.md"
        fileInputAriaLabel="Upload resume to analyze"
        dragOverTitle="Drop resume to analyze"
        dragOverSubtitle="PDF, DOCX, TXT, or Markdown"
        showDropzone={inputMode === "upload" && !text}
        dropTitle="Click to select or drag & drop a resume"
        dropSubtitle={`PDF, DOCX, Markdown, or plain text up to ${MAX_FILE_SIZE_MB}MB`}
        textareaId="ats-checker-text"
        textareaLabel="Resume text"
        textareaPlaceholder="Paste the resume text here..."
        text={text}
        onTextChange={(value) => {
          dispatchDoc({ type: "editText", value: value.slice(0, MAX_TEXT_CHARS) });
          if (!checking) onEditingIdle();
        }}
        disabled={checking || extracting}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-3 text-xs">
          <WordCountStatus words={words} minWords={MIN_WORDS} text={text} maxChars={MAX_TEXT_CHARS} />

          <label className="ml-auto flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="whitespace-nowrap font-medium text-xs text-slate-500">Match against:</span>
            <select
              value={selectedJdId}
              onChange={(event) => {
                onSelectedJdIdChange(event.target.value);
                dispatchDoc({ type: "clearResult" });
              }}
              className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">No job description</option>
              {jds.map((jd) => (
                <option key={jd.id} value={jd.id}>
                  {jd.job_title ?? jd.original_filename}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={onRunCheck}
          disabled={!canCheck || extracting}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          <FileSearch className="h-4 w-4" />
          <span>{checking ? "Analyzing..." : "Check ATS Score"}</span>
        </button>
      </div>
    </section>
  );
}
