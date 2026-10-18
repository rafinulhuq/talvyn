import { History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/cms/format";
import type { JsonPathBusyState } from "@/lib/cms/cmsConfig";
import type { CmsVersionMeta } from "@/types/cms";

interface Props {
  versions: CmsVersionMeta[];
  versionsTotal: number;
  versionsLoadingMore: boolean;
  confirmingRestore: number | null;
  onConfirmRestore: (version: number | null) => void;
  busy: JsonPathBusyState;
  onRestore: (version: number) => void;
  onLoadMore: () => void;
}

export function VersionHistoryPanel({
  versions,
  versionsTotal,
  versionsLoadingMore,
  confirmingRestore,
  onConfirmRestore,
  busy,
  onRestore,
  onLoadMore,
}: Props) {
  return (
    <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Version history</h3>
        {versionsTotal > 0 && (
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            {versionsTotal} version{versionsTotal === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {versions.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No published versions yet.</p>
        )}
        {versions.map((version) => (
          <div key={version.id} className="rounded-lg bg-white dark:bg-slate-900 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                  Version {version.version}
                  {version.is_current && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Live
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {formatRelativeTime(version.created_at)}
                  {version.created_by_name ? ` · ${version.created_by_name}` : ""}
                </p>
              </div>
              {!version.is_current && confirmingRestore !== version.version && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === "restore"}
                  onClick={() => onConfirmRestore(version.version)}
                >
                  Restore
                </Button>
              )}
            </div>
            {confirmingRestore === version.version && (
              <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                This copies version {version.version} into your draft — the live
                site doesn&apos;t change until you Publish.
                <div className="mt-2 flex gap-2">
                  <Button size="sm" loading={busy === "restore"} onClick={() => onRestore(version.version)}>
                    Restore to draft
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onConfirmRestore(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {versions.length < versionsTotal && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            loading={versionsLoadingMore}
            onClick={onLoadMore}
          >
            Show older versions ({versionsTotal - versions.length} more)
          </Button>
        )}
      </div>
    </div>
  );
}
