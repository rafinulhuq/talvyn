import type { Dispatch, RefObject } from "react";
import { FileText, Sparkles, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MAX_TEXT_CHARS, MIN_WORDS, type DocumentAction } from "@/hooks/useAiCheckerFlow";
import {
  ActiveFileBanner,
  DocumentModeTabs,
  DropzoneCanvas,
  WordCountStatus,
} from "@/components/admin/checkerStudio/DocumentInputParts";

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
  onFile: (file: File) => void;
  onRunCheck: () => void;
  onReset: () => void;
  onEditingIdle: () => void;
}

export function InputStudio({
  doc,
  dispatchDoc,
  checking,
  extracting,
  isDragOver,
  onDragOverChange,
  fileInputRef,
  words,
  canCheck,
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
          { mode: "paste", label: "Text Editor", icon: FileText },
          { mode: "upload", label: "Drop File", icon: UploadCloud },
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
        fileInputAriaLabel="Upload document to check"
        dragOverTitle="Drop document to extract text"
        dragOverSubtitle="PDF, DOCX, TXT, or Markdown"
        showDropzone={inputMode === "upload" && !text}
        dropTitle="Click to select or drag & drop document"
        dropSubtitle="PDF, DOCX, Markdown, or plain text up to 10MB"
        textareaId="ai-checker-text"
        textareaLabel="Text to check"
        textareaPlaceholder="Paste candidate answers, cover letters, essays, or take-home code explanations here..."
        text={text}
        onTextChange={(value) => {
          dispatchDoc({ type: "editText", value: value.slice(0, MAX_TEXT_CHARS) });
          if (!checking) onEditingIdle();
        }}
        disabled={checking || extracting}
      />

      {/* Footer Action & Live Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <WordCountStatus
          words={words}
          minWords={MIN_WORDS}
          text={text}
          maxChars={MAX_TEXT_CHARS}
          extra={
            words >= MIN_WORDS && (
              <>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-slate-400 dark:text-slate-500">~{Math.max(1, Math.round(words / 200))} min read</span>
              </>
            )
          }
        />

        <button
          type="button"
          onClick={onRunCheck}
          disabled={!canCheck || checking || extracting}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          <span>{checking ? "Analyzing..." : "Check AI Likeness"}</span>
        </button>
      </div>
    </section>
  );
}
