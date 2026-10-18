"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { purgeHighgardenEventsByFilter, purgeOldHighgardenEvents } from "./actions";

export function PurgeButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <form
        action={(formData) => {
          if (!window.confirm("Purge matching Highgarden events? This cannot be undone.")) return;
          startTransition(async () => {
            const result = await purgeHighgardenEventsByFilter(formData);
            setMessage(result.error ?? `Purged ${result.deletedEvents} matching event${result.deletedEvents === 1 ? "" : "s"}.`);
          });
        }}
        className="grid gap-3 rounded-xl bg-white p-3 dark:bg-slate-900 md:grid-cols-4"
      >
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Event type
          <select name="eventType" className="mt-1 w-full rounded-lg bg-slate-50 px-2 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="ALL">All events</option>
            <option value="PAGE_VIEW">Page views</option>
            <option value="CLICK">Clicks</option>
            <option value="CLIENT_ERROR">Client errors</option>
            <option value="DEAD_CLICK">Dead clicks</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          From
          <input name="from" type="date" className="mt-1 w-full rounded-lg bg-slate-50 px-2 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </label>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          To
          <input name="to" type="date" className="mt-1 w-full rounded-lg bg-slate-50 px-2 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </label>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Before
          <input name="before" type="date" className="mt-1 w-full rounded-lg bg-slate-50 px-2 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-danger-light px-3 py-2 text-sm font-medium text-danger-dark transition-colors duration-150 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:hover:bg-red-950/60 md:col-span-4"
        >
          <Trash2 className="h-4 w-4" />
          {pending ? "Purging..." : "Purge matching events"}
        </button>
      </form>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Purge Highgarden events older than 90 days?")) return;
          startTransition(async () => {
            const result = await purgeOldHighgardenEvents();
            setMessage(`Purged ${result.deletedEvents} old event${result.deletedEvents === 1 ? "" : "s"}.`);
          });
        }}
        className="inline-flex items-center gap-2 rounded-full bg-danger-light px-3 py-2 text-sm font-medium text-danger-dark transition-colors duration-150 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:hover:bg-red-950/60"
      >
        <Trash2 className="h-4 w-4" />
        {pending ? "Purging..." : "Purge older than 90 days"}
      </button>
      {message && <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>}
    </div>
  );
}
