import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { CmsLink } from "@/lib/cms/content";
import { stringValue } from "@/lib/cms/jsonPath";
import type { CmsMessage } from "@/lib/cms/cmsConfig";

export function StatusMessage({ message }: { message: CmsMessage }) {
  if (!message) return null;
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-sm",
        message.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-danger/20 bg-danger-light text-danger-dark"
      )}
      role="status"
    >
      {message.text}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const className =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={clsx(className, "min-h-24 resize-y leading-relaxed")}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const parsed = event.currentTarget.valueAsNumber;
          if (!Number.isFinite(parsed)) return;
          const clamped =
            min !== undefined && max !== undefined
              ? Math.min(Math.max(parsed, min), max)
              : parsed;
          onChange(clamped);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-brand-600"
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LinkFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CmsLink;
  onChange: (value: CmsLink) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg bg-white p-3 dark:bg-slate-900 md:grid-cols-2">
      <TextField
        label={`${label} Label`}
        value={stringValue(value.label)}
        onChange={(next) => onChange({ ...value, label: next })}
      />
      <TextField
        label={`${label} Link`}
        value={stringValue(value.href)}
        onChange={(next) => onChange({ ...value, href: next })}
      />
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}
