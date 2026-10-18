import type { ComponentType } from "react";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/cms/format";
import type { JsonPathBusyState } from "@/lib/cms/cmsConfig";

interface Props {
  icon: ComponentType<{ className?: string }>;
  label: string;
  publishedAt: string | null;
  hasLocalChanges: boolean;
  busy: JsonPathBusyState;
  onSave: () => void;
  onPublish: () => void;
}

export function DocumentToolbar({ icon: Icon, label, publishedAt, hasLocalChanges, busy, onSave, onPublish }: Props) {
  return (
    <section className="sticky top-0 z-20 rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{label}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Published {formatDate(publishedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasLocalChanges && (
            <span className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-medium text-amber-700 dark:bg-slate-900 dark:text-amber-400">
              Unsaved changes
            </span>
          )}
          <Button
            variant="outline"
            leftIcon={<Save className="h-4 w-4" />}
            loading={busy === "save"}
            disabled={!hasLocalChanges}
            onClick={onSave}
          >
            Save Draft
          </Button>
          <Button leftIcon={<Send className="h-4 w-4" />} loading={busy === "publish"} onClick={onPublish}>
            Publish
          </Button>
        </div>
      </div>
    </section>
  );
}
