import { clsx } from "clsx";
import { RichBlogEditor } from "@/components/admin/RichBlogEditor";
import type { EditorState } from "@/hooks/useBlogManagerFlow";
import type { CmsMediaAsset } from "@/types/cms";
import { fieldClasses } from "./fieldClasses";

interface Props {
  editor: EditorState;
  slugTouched: boolean;
  contentMode: "rich" | "markdown";
  onContentModeChange: (mode: "rich" | "markdown") => void;
  onUpdate: (patch: Partial<EditorState>) => void;
  onUploadImage: (file: File) => Promise<CmsMediaAsset | null>;
}

export function BlogEditorFields({
  editor,
  slugTouched,
  contentMode,
  onContentModeChange,
  onUpdate,
  onUploadImage,
}: Props) {
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-5">
        <div>
          <label htmlFor="blog-title" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Title</label>
          <input
            id="blog-title"
            value={editor.title}
            onChange={(event) => {
              onUpdate({ title: event.target.value });
              if (!slugTouched) onUpdate({ slug: "" });
            }}
            placeholder="Post title"
            className={fieldClasses("text-base font-semibold")}
          />
        </div>
        <div>
          <label htmlFor="blog-excerpt" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Excerpt</label>
          <textarea
            id="blog-excerpt"
            value={editor.excerpt}
            onChange={(event) => onUpdate({ excerpt: event.target.value })}
            placeholder="One or two sentences shown on the blog list page."
            rows={2}
            className={fieldClasses("resize-y")}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="blog-content-markdown" className="block text-xs font-medium text-slate-500 dark:text-slate-400">Content</label>
            <div className="flex gap-0.5 rounded-lg bg-white p-0.5 dark:bg-slate-900">
              {(["rich", "markdown"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onContentModeChange(mode)}
                  className={clsx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    contentMode === mode
                      ? "bg-[#F2D74E] text-[#1A1600] font-semibold shadow-sm"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                  )}
                >
                  {mode === "rich" ? "Editor" : "Markdown"}
                </button>
              ))}
            </div>
          </div>
          {contentMode === "rich" ? (
            <RichBlogEditor
              value={editor.contentMd}
              onChange={(markdown) => onUpdate({ contentMd: markdown })}
              onUploadImage={onUploadImage}
            />
          ) : (
            <textarea
              id="blog-content-markdown"
              value={editor.contentMd}
              onChange={(event) => onUpdate({ contentMd: event.target.value })}
              placeholder={"# Heading\n\nWrite your post in markdown…"}
              rows={18}
              className={fieldClasses("resize-y font-mono text-xs leading-5")}
            />
          )}
        </div>
      </section>
    </div>
  );
}
