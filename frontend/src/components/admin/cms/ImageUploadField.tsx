/**
 * ImageUploadField — a URL text input paired with a real file upload.
 *
 * The CMS already had a Super Admin-gated upload pipeline
 * (POST /api/cms/media -> FastAPI -> disk, returning a public
 * /api/cmp/media/<id> URL) but nothing in the editor UI ever called it, so
 * the only way to get an image in was to host it somewhere else and paste a
 * link. This wires the two together.
 *
 * The text input stays: an already-hosted image (a CDN headshot, a file in
 * /public) should not have to be re-uploaded just to be referenced. Upload
 * writes its resulting URL into the same field, so both paths produce the
 * same draft JSON and nothing downstream needs to know which was used.
 */

"use client";

import { useId, useRef, useState } from "react";
import { clsx } from "clsx";
import { ImageUp, Loader2, Trash2, TriangleAlert } from "lucide-react";

/** Mirrors _ALLOWED_MEDIA_TYPES in backend/app/services/cms_service.py, minus
 *  PDF — this field is for images. Kept client-side purely as a courtesy so a
 *  wrong file is rejected before a pointless round trip; the server is still
 *  the one that decides. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPT_ATTR = ACCEPTED.join(",");
const MAX_BYTES = 8 * 1024 * 1024;

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  /** Preview shape. Avatars are round; anything else reads better square. */
  preview?: "circle" | "square";
  /** Sent along so the asset is identifiable in the media library later. */
  altText?: string;
}

export function ImageUploadField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  preview = "circle",
  altText,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Set when the <img> fails to load, cleared whenever the URL changes — so a
  // typo'd link shows a broken-image note instead of a silently empty box.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Images must be 8MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("title", file.name);
      if (altText) form.append("alt_text", altText);

      const res = await fetch("/api/cms/media", { method: "POST", body: form });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.error?.message ?? "Upload failed. Please try again.");
        return;
      }
      if (typeof body?.url !== "string") {
        setError("Upload succeeded but returned no URL.");
        return;
      }

      setBrokenUrl(null);
      onChange(body.url);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setUploading(false);
      // Clear the input so re-picking the same file fires `change` again.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function setUrl(next: string) {
    setBrokenUrl(null);
    setError(null);
    onChange(next);
  }

  const showBroken = !!value && brokenUrl === value;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>

      <div className="flex items-start gap-3">
        {/* Preview / drop zone. Doubles as the click target for the picker so
            the whole thing behaves like one control. */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label={value ? "Replace image" : "Upload image"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={clsx(
            "group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed",
            "transition duration-200 ease-smooth disabled:cursor-wait",
            preview === "circle" ? "rounded-full" : "rounded-xl",
            dragging
              ? "border-brand-500 bg-brand-50 scale-105"
              : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-800/60"
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          ) : value && !showBroken ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt="Preview"
                onError={() => setBrokenUrl(value)}
                className="h-full w-full object-cover"
              />
              {/* Hover scrim — the affordance that this image is replaceable. */}
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition duration-200 ease-smooth group-hover:bg-slate-900/55 group-hover:opacity-100">
                <ImageUp className="h-4 w-4 text-white" />
              </span>
            </>
          ) : showBroken ? (
            <TriangleAlert className="h-5 w-5 text-warning-dark" />
          ) : (
            <ImageUp className="h-5 w-5 text-slate-400 transition-colors group-hover:text-brand-600" />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            id={inputId}
            value={value}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="pressable inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ImageUp className="h-3 w-3" />
              )}
              {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
            </button>

            {value && !uploading && (
              <button
                type="button"
                onClick={() => setUrl("")}
                className="pressable inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-danger-light hover:text-danger-dark"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            )}
          </div>

          {error ? (
            <p className="flex items-start gap-1 text-[11px] text-danger-dark">
              <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
              {error}
            </p>
          ) : showBroken ? (
            <p className="text-[11px] text-warning-dark">
              That URL didn&apos;t load as an image. Check the link, or upload a file instead.
            </p>
          ) : (
            hint && <p className="text-[11px] text-slate-400">{hint}</p>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
