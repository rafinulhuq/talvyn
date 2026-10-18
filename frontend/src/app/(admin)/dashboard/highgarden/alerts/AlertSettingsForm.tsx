"use client";

import { useState, useTransition } from "react";
import { Bell, Send } from "lucide-react";
import { saveHighgardenAlertSettings, sendHighgardenAlertDigest } from "../actions";

type Props = {
  defaultRecipients: string;
  enabled: boolean;
  weeklyDigestEnabled: boolean;
  errorThreshold: number;
  deadClickThreshold: number;
  dropThreshold: number;
};

export function AlertSettingsForm({
  defaultRecipients,
  enabled,
  weeklyDigestEnabled,
  errorThreshold,
  deadClickThreshold,
  dropThreshold,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <form
        action={(formData) => {
          startTransition(async () => {
            const result = await saveHighgardenAlertSettings(formData);
            setMessage(result.message);
          });
        }}
        className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60"
      >
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Alert settings</h2>
        </div>
        <div className="grid gap-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Recipients
            <textarea
              name="recipients"
              defaultValue={defaultRecipients}
              rows={3}
              placeholder="admin@example.com, owner@example.com"
              className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-100 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-brand-900"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <NumberField name="errorThreshold" label="Error threshold" defaultValue={errorThreshold} />
            <NumberField name="deadClickThreshold" label="Dead-click threshold" defaultValue={deadClickThreshold} />
            <NumberField name="dropThreshold" label="Drop threshold %" defaultValue={dropThreshold} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input name="enabled" type="checkbox" defaultChecked={enabled} className="h-4 w-4 rounded border-slate-300 text-brand-500" />
            Enable major-drop/error alerts
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input
              name="weeklyDigestEnabled"
              type="checkbox"
              defaultChecked={weeklyDigestEnabled}
              className="h-4 w-4 rounded border-slate-300 text-brand-500"
            />
            Enable weekly digest when scheduler is connected
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="mt-5 rounded-full bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-accent-700 disabled:bg-accent-300"
        >
          {pending ? "Saving..." : "Save alert settings"}
        </button>
      </form>

      <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Manual digest</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Send the current 7-day Highgarden summary through the configured backend email provider.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await sendHighgardenAlertDigest();
              setMessage(result.message);
            });
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Send className="h-4 w-4" />
          {pending ? "Working..." : "Send digest now"}
        </button>
      </div>

      {message && <p className="text-sm font-medium text-slate-600 dark:text-slate-300 lg:col-span-2">{message}</p>}
    </div>
  );
}

function NumberField({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      <input
        name={name}
        type="number"
        min={1}
        max={1000}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-100 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-brand-900"
      />
    </label>
  );
}
