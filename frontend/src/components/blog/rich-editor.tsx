"use client";

import TiptapImage from "@tiptap/extension-image";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { UploadButton } from "@/components/cmp/json-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const getMarkdown = (e: Editor) => (e.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();

/** WYSIWYG for editors, markdown in storage (the public site renders markdown without raw HTML). */
export function RichEditor({ value, onChange }: { value: string; onChange: (markdown: string) => void }) {
  const last = useRef(value);
  const editor = useEditor({
    immediatelyRender: false, // server render can't measure the editor
    shouldRerenderOnTransaction: true, // keeps the toolbar's active states current
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] } }),
      TiptapImage,
      Placeholder.configure({ placeholder: "Write the post. Use the toolbar for headings, lists, links and images." }),
      CharacterCount,
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value,
    editorProps: { attributes: { class: "prose-talvyn min-h-[28rem] max-w-none px-6 py-5 outline-none", "aria-label": "Post body" } },
    onUpdate: ({ editor: e }) => {
      const md = getMarkdown(e);
      last.current = md;
      onChange(md);
    },
  });

  // Outside changes (e.g. loading a post) replace the content without disturbing typing.
  useEffect(() => {
    if (editor && value !== last.current) {
      editor.commands.setContent(value);
      last.current = value;
    }
  }, [editor, value]);

  const [linkOpen, setLinkOpen] = useState(false);

  if (!editor) return <div className="min-h-[30rem] rounded-panel border border-line bg-surface" />;
  const state = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    h2: editor.isActive("heading", { level: 2 }),
    h3: editor.isActive("heading", { level: 3 }),
    ul: editor.isActive("bulletList"),
    ol: editor.isActive("orderedList"),
    quote: editor.isActive("blockquote"),
    code: editor.isActive("codeBlock"),
    link: editor.isActive("link"),
    words: (editor.storage as unknown as { characterCount: { words: () => number } }).characterCount.words(),
  };
  const chain = () => editor.chain().focus();

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-sunken/50 px-2 py-1.5">
        <Tool label="Bold" on={state.bold} run={() => chain().toggleBold().run()}>
          <Bold />
        </Tool>
        <Tool label="Italic" on={state.italic} run={() => chain().toggleItalic().run()}>
          <Italic />
        </Tool>
        <Sep />
        <Tool label="Heading" on={state.h2} run={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 />
        </Tool>
        <Tool label="Subheading" on={state.h3} run={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 />
        </Tool>
        <Sep />
        <Tool label="Bulleted list" on={state.ul} run={() => chain().toggleBulletList().run()}>
          <List />
        </Tool>
        <Tool label="Numbered list" on={state.ol} run={() => chain().toggleOrderedList().run()}>
          <ListOrdered />
        </Tool>
        <Tool label="Quote" on={state.quote} run={() => chain().toggleBlockquote().run()}>
          <Quote />
        </Tool>
        <Tool label="Code block" on={state.code} run={() => chain().toggleCodeBlock().run()}>
          <Code />
        </Tool>
        <Tool label="Divider" run={() => chain().setHorizontalRule().run()}>
          <Minus />
        </Tool>
        <Sep />
        <Tool label={state.link ? "Edit link" : "Add link"} on={state.link} run={() => setLinkOpen(true)}>
          <Link2 />
        </Tool>
        <span className="[&_button]:h-7 [&_button]:px-2 [&_button]:text-sm">
          <UploadButton label="Image" onUploaded={(src) => chain().setImage({ src, alt: "" }).run()} />
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <Tool label="Undo" run={() => chain().undo().run()}>
            <Undo2 />
          </Tool>
          <Tool label="Redo" run={() => chain().redo().run()}>
            <Redo2 />
          </Tool>
          <span className="ml-2 text-sm tabular-nums text-ink-muted">{state.words} words</span>
        </span>
      </div>
      <EditorContent editor={editor} />
      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} initial={(editor.getAttributes("link").href as string | undefined) ?? ""} onApply={(href) => (href ? chain().extendMarkRange("link").setLink({ href }).run() : chain().extendMarkRange("link").unsetLink().run())} />
    </div>
  );
}

function Tool({ label, on = false, run, children }: { label: string; on?: boolean; run: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={run}
      className={cn("grid size-7 place-items-center rounded-control text-ink-muted hover:bg-surface hover:text-ink [&_svg]:size-4", on && "bg-surface text-ink")}
    >
      {children}
    </button>
  );
}
const Sep = () => <span aria-hidden className="mx-1 h-5 w-px bg-line" />;

function LinkDialog({ open, onOpenChange, initial, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; initial: string; onApply: (href: string) => void }) {
  const [href, setHref] = useState(initial);
  const [error, setError] = useState<string>();
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setHref(initial);
      setError(undefined);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const h = href.trim();
    if (h && !/^(https?:\/\/|mailto:|\/)/i.test(h)) return setError("Use a full https:// address, a mailto: link or a path starting with /.");
    onApply(h);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Link">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Address" error={error} hint="Leave empty to remove the link.">
            <Input autoFocus value={href} onChange={(e) => (setHref(e.target.value), setError(undefined))} placeholder="https://" />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary">
              Apply
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
