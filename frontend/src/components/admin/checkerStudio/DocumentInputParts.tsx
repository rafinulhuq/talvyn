import type { RefObject } from "react";
import { clsx } from "clsx";
import { FileCode2, RotateCcw, UploadCloud, X, type LucideIcon } from "lucide-react";

export type DocMode = "paste" | "upload";

export interface ModeTab {
  mode: DocMode;
  label: string;
  icon: LucideIcon;
}

/** Tab strip for switching between paste/upload modes, plus a "Clear" action. */
export function DocumentModeTabs({
  tabs,
  activeMode,
  onModeChange,
  showClear,
  onClear,
}: {
  tabs: ModeTab[];
  activeMode: DocMode;
  onModeChange: (mode: DocMode) => void;
  showClear: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100/80 p-1 dark:bg-slate-800/80">
        {tabs.map(({ mode, label, icon: Icon }) => {
          const isActive = activeMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onModeChange(mode)}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Icon className={clsx("h-3.5 w-3.5", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400")} />
              {label}
            </button>
          );
        })}
      </div>

      {showClear && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}

/** Banner shown once a file has been picked, with its name/size and a remove button. */
export function ActiveFileBanner({
  sourceName,
  sourceSize,
  onClear,
  showSizeWhenZero = false,
}: {
  sourceName: string;
  sourceSize: number | null;
  onClear: () => void;
  showSizeWhenZero?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-5 py-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
      <div className="flex items-center gap-2">
        <FileCode2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span className="font-semibold text-slate-900 dark:text-slate-100">{sourceName}</span>
        {sourceSize != null && (showSizeWhenZero || sourceSize > 0) && (
          <span className="text-[11px] text-slate-400">({(sourceSize / 1024).toFixed(1)} KB)</span>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove file"
        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Drag/drop + upload-dropzone-or-textarea canvas, shared by the AI Checker
 * and ATS Checker input studios. `showDropzone` decides between the
 * "click or drop a file" button and the text editor.
 */
export function DropzoneCanvas({
  isDragOver,
  onDragOverChange,
  onFile,
  fileInputRef,
  accept,
  fileInputAriaLabel,
  dragOverTitle,
  dragOverSubtitle,
  showDropzone,
  dropTitle,
  dropSubtitle,
  textareaId,
  textareaLabel,
  textareaPlaceholder,
  text,
  onTextChange,
  disabled,
}: {
  isDragOver: boolean;
  onDragOverChange: (over: boolean) => void;
  onFile: (file: File) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  accept: string;
  fileInputAriaLabel: string;
  dragOverTitle: string;
  dragOverSubtitle: string;
  showDropzone: boolean;
  dropTitle: string;
  dropSubtitle: string;
  textareaId: string;
  textareaLabel: string;
  textareaPlaceholder: string;
  text: string;
  onTextChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="relative flex-1 p-5 min-h-[380px] bg-white dark:bg-slate-900"
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverChange(true);
      }}
      onDragLeave={() => onDragOverChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverChange(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      {isDragOver && (
        <div className="absolute inset-4 z-10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-500 bg-indigo-50/90 text-indigo-700 backdrop-blur-xs shadow-md dark:bg-indigo-950/90 dark:text-indigo-300">
          <UploadCloud className="h-8 w-8 text-indigo-600 animate-bounce dark:text-indigo-400" />
          <p className="mt-2 text-sm font-semibold">{dragOverTitle}</p>
          <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80">{dragOverSubtitle}</p>
        </div>
      )}

      {showDropzone ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-full w-full min-h-[340px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center transition-colors hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-indigo-500 dark:hover:bg-slate-850"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-600/10 dark:bg-indigo-950/40 dark:text-indigo-400">
            <UploadCloud className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{dropTitle}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{dropSubtitle}</p>
          <span className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Browse Files
          </span>
        </button>
      ) : (
        <div className="flex h-[340px] flex-col">
          <label
            htmlFor={textareaId}
            className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            {textareaLabel}
          </label>
          <textarea
            id={textareaId}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={textareaPlaceholder}
            disabled={disabled}
            className="w-full flex-1 resize-none border-0 bg-transparent text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        aria-label={fileInputAriaLabel}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

/** Word-count status line: amber under the minimum, brand color once past it. */
export function WordCountStatus({
  words,
  minWords,
  text,
  maxChars,
  extra,
}: {
  words: number;
  minWords: number;
  text: string;
  maxChars: number;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
      <span
        className={clsx(
          "font-medium",
          words < minWords && text.length > 0
            ? "text-amber-600 dark:text-amber-400"
            : words >= minWords
              ? "text-slate-900 dark:text-slate-100 font-semibold"
              : "text-slate-400 dark:text-slate-500"
        )}
      >
        {words.toLocaleString()} words
      </span>
      <span className="text-slate-300 dark:text-slate-700">·</span>
      <span>
        {text.length.toLocaleString()} / {maxChars.toLocaleString()} chars
      </span>
      {words < minWords && text.trim() && (
        <>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span className="text-amber-600 dark:text-amber-400">add {minWords - words} more words</span>
        </>
      )}
      {extra}
    </div>
  );
}
