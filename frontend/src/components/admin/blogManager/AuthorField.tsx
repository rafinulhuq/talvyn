import { Button } from "@/components/ui/Button";
import type { CmsAuthorProfile } from "@/types/cms";
import { fieldClasses } from "./fieldClasses";

interface Props {
  authorProfileId: string | null;
  onAuthorProfileIdChange: (id: string | null) => void;
  authors: CmsAuthorProfile[];
  newAuthorOpen: boolean;
  onNewAuthorOpenChange: (open: boolean) => void;
  newAuthorName: string;
  onNewAuthorNameChange: (name: string) => void;
  onNewAuthorAvatarFileChange: (file: File | null) => void;
  savingAuthor: boolean;
  onCreateAuthor: () => void;
}

export function AuthorField({
  authorProfileId,
  onAuthorProfileIdChange,
  authors,
  newAuthorOpen,
  onNewAuthorOpenChange,
  newAuthorName,
  onNewAuthorNameChange,
  onNewAuthorAvatarFileChange,
  savingAuthor,
  onCreateAuthor,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Author</h3>
      <select
        aria-label="Author"
        value={authorProfileId ?? ""}
        onChange={(event) => onAuthorProfileIdChange(event.target.value || null)}
        className={fieldClasses()}
      >
        <option value="">Your account name</option>
        {authors.map((author) => (
          <option key={author.id} value={author.id}>
            {author.name}
          </option>
        ))}
      </select>
      {newAuthorOpen ? (
        <div className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-300 p-2">
          <label htmlFor="blog-new-author-name" className="block text-xs font-medium text-slate-500">
            Author name
          </label>
          <input
            id="blog-new-author-name"
            value={newAuthorName}
            onChange={(event) => onNewAuthorNameChange(event.target.value)}
            placeholder="Author name"
            className={fieldClasses("text-xs")}
          />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Author avatar image"
            onChange={(event) => onNewAuthorAvatarFileChange(event.target.files?.[0] ?? null)}
            className="w-full text-xs text-slate-500"
          />
          <div className="flex gap-2">
            <Button size="sm" loading={savingAuthor} onClick={onCreateAuthor}>
              Save author
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onNewAuthorOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => onNewAuthorOpenChange(true)}>
          + New author
        </Button>
      )}
    </section>
  );
}
