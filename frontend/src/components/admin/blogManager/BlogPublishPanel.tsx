import { Globe2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { EditorState } from "@/hooks/useBlogManagerFlow";
import type { CmsAuthorProfile, CmsMediaAsset } from "@/types/cms";
import { fieldClasses } from "./fieldClasses";
import { CoverImageField } from "./CoverImageField";
import { AuthorField } from "./AuthorField";
import { ScheduleField } from "./ScheduleField";

interface Props {
  editor: EditorState;
  onUpdate: (patch: Partial<EditorState>) => void;
  onSlugTouched: () => void;
  onClose: () => void;

  coverAsset: CmsMediaAsset | null;
  coverUploading: boolean;
  onUploadCover: (file: File) => Promise<void>;

  authors: CmsAuthorProfile[];
  newAuthorOpen: boolean;
  onNewAuthorOpenChange: (open: boolean) => void;
  newAuthorName: string;
  onNewAuthorNameChange: (name: string) => void;
  onNewAuthorAvatarFileChange: (file: File | null) => void;
  savingAuthor: boolean;
  onCreateAuthor: () => void;

  scheduleMode: "now" | "later";
  onScheduleModeChange: (mode: "now" | "later") => void;
  scheduleAt: string;
  onScheduleAtChange: (value: string) => void;

  editorBusy: "save" | "publish" | "unpublish" | "archive" | null;
  onPublish: () => void;

  confirmArchive: boolean;
  onConfirmArchiveChange: (value: boolean) => void;
  onArchive: () => void;
}

export function BlogPublishPanel({
  editor,
  onUpdate,
  onSlugTouched,
  onClose,
  coverAsset,
  coverUploading,
  onUploadCover,
  authors,
  newAuthorOpen,
  onNewAuthorOpenChange,
  newAuthorName,
  onNewAuthorNameChange,
  onNewAuthorAvatarFileChange,
  savingAuthor,
  onCreateAuthor,
  scheduleMode,
  onScheduleModeChange,
  scheduleAt,
  onScheduleAtChange,
  editorBusy,
  onPublish,
  confirmArchive,
  onConfirmArchiveChange,
  onArchive,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Publish details</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="blog-slug" className="mb-1 block text-xs font-medium text-slate-500">
              Slug <span className="font-normal text-slate-400">(URL: /blog/…)</span>
            </label>
            <input
              id="blog-slug"
              value={editor.slug}
              onChange={(event) => {
                onSlugTouched();
                onUpdate({ slug: event.target.value });
              }}
              placeholder="auto-generated from title"
              className={fieldClasses("font-mono text-xs")}
            />
          </div>

          <CoverImageField
            coverAsset={coverAsset}
            coverUploading={coverUploading}
            onUpload={onUploadCover}
            onRemove={() => onUpdate({ coverImageAssetId: null })}
          />

          <AuthorField
            authorProfileId={editor.authorProfileId}
            onAuthorProfileIdChange={(id) => onUpdate({ authorProfileId: id })}
            authors={authors}
            newAuthorOpen={newAuthorOpen}
            onNewAuthorOpenChange={onNewAuthorOpenChange}
            newAuthorName={newAuthorName}
            onNewAuthorNameChange={onNewAuthorNameChange}
            onNewAuthorAvatarFileChange={onNewAuthorAvatarFileChange}
            savingAuthor={savingAuthor}
            onCreateAuthor={onCreateAuthor}
          />

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 id="blog-tags-heading" className="mb-3 text-sm font-semibold text-slate-900">Tags</h3>
            <input
              aria-labelledby="blog-tags-heading"
              value={editor.tags}
              onChange={(event) => onUpdate({ tags: event.target.value })}
              placeholder="hiring, ai, product"
              className={fieldClasses()}
            />
            <p className="mt-1.5 text-xs text-slate-400">Comma-separated, up to 10.</p>
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Globe2 className="h-4 w-4 text-slate-400" />
              SEO
            </h3>
            <label htmlFor="blog-seo-title" className="mb-1 block text-xs font-medium text-slate-500">SEO title</label>
            <input
              id="blog-seo-title"
              value={editor.seoTitle}
              onChange={(event) => onUpdate({ seoTitle: event.target.value })}
              placeholder="Defaults to the post title"
              className={fieldClasses()}
            />
            <label htmlFor="blog-seo-description" className="mb-1 mt-3 block text-xs font-medium text-slate-500">
              SEO description
            </label>
            <textarea
              id="blog-seo-description"
              value={editor.seoDescription}
              onChange={(event) => onUpdate({ seoDescription: event.target.value })}
              placeholder="Defaults to the excerpt"
              rows={3}
              className={fieldClasses("resize-y")}
            />
          </section>

          <ScheduleField
            scheduleMode={scheduleMode}
            onScheduleModeChange={onScheduleModeChange}
            scheduleAt={scheduleAt}
            onScheduleAtChange={onScheduleAtChange}
          />

          <Button className="w-full" loading={editorBusy === "publish"} onClick={onPublish}>
            {scheduleMode === "later" && scheduleAt ? "Schedule post" : "Publish now"}
          </Button>

          {editor.id && (
            <section className="rounded-xl border border-slate-200 p-4">
              {confirmArchive ? (
                <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                  Delete this post? It disappears from the blog and this list.
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="danger" loading={editorBusy === "archive"} onClick={onArchive}>
                      Delete post
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onConfirmArchiveChange(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => onConfirmArchiveChange(true)}
                >
                  Delete post
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
