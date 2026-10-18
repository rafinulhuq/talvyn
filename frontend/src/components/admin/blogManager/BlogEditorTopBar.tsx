import { clsx } from "clsx";
import { ArrowLeft, Eye, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDate, isScheduled, type EditorState } from "@/hooks/useBlogManagerFlow";

interface Props {
  editor: EditorState;
  showPreview: boolean;
  autosaveState: "idle" | "saving" | "saved";
  editorBusy: "save" | "publish" | "unpublish" | "archive" | null;
  onClose: () => void;
  onTogglePreview: () => void;
  onSave: () => void;
  onOpenPublishPanel: () => void;
  onUnpublish: () => void;
}

export function BlogEditorTopBar({
  editor,
  showPreview,
  autosaveState,
  editorBusy,
  onClose,
  onTogglePreview,
  onSave,
  onOpenPublishPanel,
  onUnpublish,
}: Props) {
  const scheduled = isScheduled(editor.status, editor.publishedAt);

  return (
    <section className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={onClose}>
            All posts
          </Button>
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              editor.status === "published"
                ? scheduled
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            )}
          >
            {editor.status === "published"
              ? scheduled
                ? `Scheduled for ${formatDate(editor.publishedAt)}`
                : "Published"
              : "Draft"}
          </span>
          {editor.publishedAt && !scheduled && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              First published {formatDate(editor.publishedAt)}
            </span>
          )}
          {editor.status === "draft" && autosaveState !== "idle" && (
            <span className="text-xs text-slate-400 dark:text-slate-500" role="status">
              {autosaveState === "saving" ? "Saving…" : "Saved"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" leftIcon={<Eye className="h-4 w-4" />} onClick={onTogglePreview}>
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button variant="outline" loading={editorBusy === "save"} onClick={onSave}>
            {editor.status === "published" ? "Save changes" : "Save draft"}
          </Button>
          {editor.status === "published" ? (
            <>
              <Button variant="outline" onClick={onOpenPublishPanel}>
                {scheduled ? "Edit schedule" : "Published settings"}
              </Button>
              <Button
                variant="outline"
                leftIcon={<Undo2 className="h-4 w-4" />}
                loading={editorBusy === "unpublish"}
                onClick={onUnpublish}
              >
                Unpublish
              </Button>
            </>
          ) : (
            <Button leftIcon={<Send className="h-4 w-4" />} onClick={onOpenPublishPanel}>
              Publish
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
