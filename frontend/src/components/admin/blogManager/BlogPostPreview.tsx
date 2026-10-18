import Image from "next/image";
import { MarkdownContent } from "@/components/MarkdownContent";
import type { EditorState } from "@/hooks/useBlogManagerFlow";
import type { CmsMediaAsset } from "@/types/cms";

interface Props {
  editor: EditorState;
  coverAsset: CmsMediaAsset | null;
}

export function BlogPostPreview({ editor, coverAsset }: Props) {
  return (
    <section className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-6 lg:p-10">
      <p className="mb-6 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Preview
      </p>
      {coverAsset && (
        <div className="relative mb-8 h-80 w-full overflow-hidden rounded-xl">
          <Image
            src={coverAsset.url}
            alt={coverAsset.alt_text ?? ""}
            fill
            sizes="(min-width: 1024px) 768px, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        {editor.title || "Untitled post"}
      </h1>
      {editor.excerpt && <p className="mt-3 text-lg text-slate-500">{editor.excerpt}</p>}
      <div className="mt-6">
        <MarkdownContent content={editor.contentMd || "*Nothing written yet.*"} />
      </div>
    </section>
  );
}
