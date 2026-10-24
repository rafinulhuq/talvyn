/**
 * ExtractedTextPanel — collapsible card showing the job description text, with
 * copy-to-clipboard and (when `jdId` is given) an inline edit/save affordance.
 * Editing is the review step before skill extraction — it saves via
 * PATCH /jd/{id}/text.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy, FileText, Pencil, X, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { jdApi } from "@/lib/api/jd";

interface ExtractedTextPanelProps {
  text: string;
  /** When provided, the text becomes editable (review step). */
  jdId?: string;
}

const PREVIEW_LIMIT = 5000;

export function ExtractedTextPanel({ text, jdId }: ExtractedTextPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [value, setValue] = useState(text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function startEdit() {
    setDraft(value);
    setSaveError(null);
    setEditing(true);
    setOpen(true);
  }

  async function handleSave() {
    if (!jdId || saving) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setSaveError("Job description text cannot be empty.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await jdApi.updateText(jdId, trimmed);
      if (!res.success) {
        setSaveError(res.error?.message ?? "Could not save changes.");
        return;
      }
      setValue(trimmed);
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const truncated = value.length > PREVIEW_LIMIT;
  const remaining = value.length - PREVIEW_LIMIT;

  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-[#121317]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <FileText className="h-4 w-4 shrink-0 text-[#F2D74E]" />
          <span className="text-sm font-semibold text-white">Job Description Text</span>
          <span className="shrink-0 rounded-full border border-white/10 bg-[#181A1F] px-2 py-0.5 text-[11px] font-medium text-white/80">
            {value.length.toLocaleString()} characters
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {jdId && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-[#F2D74E] transition-colors hover:bg-white/10"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          {open && !editing && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#4ADE80]" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse text" : "Expand text"}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className={clsx("h-4 w-4 transition-transform", open && "rotate-90")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/8 bg-[#181A1F] animate-fade-in motion-reduce:animate-none">
          {editing ? (
            <div className="p-4">
              <textarea
                aria-label="Job description text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={16}
                className="w-full resize-y rounded-lg border border-white/10 bg-[#121317] p-3 font-mono text-[12px] leading-relaxed text-white outline-none focus:border-[#F2D74E] focus:ring-1 focus:ring-[#F2D74E]"
              />
              {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2D74E] px-4 py-2 text-xs font-semibold text-[#1A1600] transition-colors hover:bg-[#F7E27A] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setSaveError(null);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed text-white">
              {value.slice(0, PREVIEW_LIMIT)}
              {truncated && (
                <span className="text-white/60">
                  {"\n\n"}… {remaining.toLocaleString()} more characters
                </span>
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
