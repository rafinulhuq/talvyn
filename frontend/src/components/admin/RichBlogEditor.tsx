"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  Minus,
  Quote,
  SquareCode,
  Upload,
  X,
} from "lucide-react";
import { clsx } from "clsx";

import type { CmsMediaAsset } from "@/types/cms";

interface RichBlogEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  onUploadImage: (file: File) => Promise<CmsMediaAsset | null>;
}

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
}

function isSafeHref(href: string): boolean {
  return (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("https://") ||
    href.startsWith("http://") ||
    href.startsWith("mailto:")
  );
}

const menuButtonClasses =
  "flex h-8 w-8 items-center justify-center rounded-md text-slate-200 transition-colors hover:bg-slate-700 hover:text-white";

function MenuButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Preserve the text selection — don't let the button steal focus.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={clsx(menuButtonClasses, active && "bg-slate-700 text-white")}
    >
      {children}
    </button>
  );
}

export function RichBlogEditor({
  value,
  onChange,
  onUploadImage,
}: RichBlogEditorProps) {
  const lastMarkdownRef = useRef(value);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true },
      }),
      TiptapImage,
      Placeholder.configure({ placeholder: "Tell your story…" }),
      CharacterCount,
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "blog-editor-content focus:outline-none",
        "aria-label": "Post content",
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = getMarkdown(current);
      lastMarkdownRef.current = markdown;
      onChange(markdown);
    },
  });

  // Adopt external content changes (switching posts, edits made in
  // Markdown mode) without disturbing the cursor while typing here.
  useEffect(() => {
    if (!editor || value === lastMarkdownRef.current) return;
    lastMarkdownRef.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const uploadAndInsert = useCallback(
    async (files: FileList | File[]) => {
      const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      setUploading(true);
      try {
        const assets = await Promise.all(images.map((file) => onUploadImage(file)));
        for (const asset of assets) {
          if (asset) {
            editor
              ?.chain()
              .focus()
              .setImage({ src: asset.url, alt: asset.alt_text ?? "" })
              .run();
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [editor, onUploadImage]
  );

  // Drag-dropped or pasted images upload straight into the media library.
  const onDroppedFiles = useEffectEvent((files: FileList) => {
    void uploadAndInsert(files);
  });

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    function onDrop(event: DragEvent) {
      const files = event.dataTransfer?.files;
      if (files && Array.from(files).some((file) => file.type.startsWith("image/"))) {
        event.preventDefault();
        onDroppedFiles(files);
      }
    }

    function onPaste(event: ClipboardEvent) {
      const files = event.clipboardData?.files;
      if (files && Array.from(files).some((file) => file.type.startsWith("image/"))) {
        event.preventDefault();
        onDroppedFiles(files);
      }
    }

    dom.addEventListener("drop", onDrop);
    dom.addEventListener("paste", onPaste);
    return () => {
      dom.removeEventListener("drop", onDrop);
      dom.removeEventListener("paste", onPaste);
    };
  }, [editor]);

  function applyLink() {
    if (!editor || linkDraft === null) return;
    const href = linkDraft.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (isSafeHref(href)) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDraft(null);
  }

  if (!editor) {
    return (
      <div className="min-h-[24rem] rounded-xl bg-white p-6 text-sm text-slate-400 dark:bg-slate-900 dark:text-slate-500">
        Loading editor…
      </div>
    );
  }

  const words = (
    editor.storage as unknown as { characterCount: { words: () => number } }
  ).characterCount.words();

  return (
    <div className="blog-editor rounded-xl bg-white dark:bg-slate-900">
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: current, state }) =>
          !state.selection.empty && current.isEditable && !current.isActive("image")
        }
      >
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-900 p-1 shadow-xl">
          {linkDraft === null ? (
            <>
              <MenuButton
                label="Bold"
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-4 w-4" />
              </MenuButton>
              <MenuButton
                label="Italic"
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-4 w-4" />
              </MenuButton>
              <MenuButton
                label="Link"
                active={editor.isActive("link")}
                onClick={() =>
                  setLinkDraft(String(editor.getAttributes("link").href ?? ""))
                }
              >
                <Link2 className="h-4 w-4" />
              </MenuButton>
              <span className="mx-0.5 h-5 w-px bg-slate-700" />
              <MenuButton
                label="Title"
                active={editor.isActive("heading", { level: 2 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                <Heading2 className="h-4 w-4" />
              </MenuButton>
              <MenuButton
                label="Subtitle"
                active={editor.isActive("heading", { level: 3 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              >
                <Heading3 className="h-4 w-4" />
              </MenuButton>
              <MenuButton
                label="Quote"
                active={editor.isActive("blockquote")}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >
                <Quote className="h-4 w-4" />
              </MenuButton>
              <MenuButton
                label="Inline code"
                active={editor.isActive("code")}
                onClick={() => editor.chain().focus().toggleCode().run()}
              >
                <Code className="h-4 w-4" />
              </MenuButton>
            </>
          ) : (
            <div className="flex flex-col gap-1 px-1">
              <label
                htmlFor="rte-link-url"
                className="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
              >
                Link URL
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="rte-link-url"
                  autoFocus
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyLink();
                    }
                    if (event.key === "Escape") setLinkDraft(null);
                  }}
                  placeholder="Paste a link…"
                  className="h-8 w-56 rounded-md bg-slate-800 px-2 text-sm text-white placeholder:text-slate-400 focus:outline-none"
                />
                <MenuButton label="Apply link" onClick={applyLink}>
                  <Link2 className="h-4 w-4" />
                </MenuButton>
                <MenuButton label="Cancel" onClick={() => setLinkDraft(null)}>
                  <X className="h-4 w-4" />
                </MenuButton>
              </div>
            </div>
          )}
        </div>
      </BubbleMenu>

      <FloatingMenu editor={editor}>
        <div className="ml-2 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <MenuButton label="Upload image" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 text-slate-500" />
          </MenuButton>
          <MenuButton
            label="Divider"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="h-4 w-4 text-slate-500" />
          </MenuButton>
          <MenuButton
            label="Bullet list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4 text-slate-500" />
          </MenuButton>
          <MenuButton
            label="Code block"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <SquareCode className="h-4 w-4 text-slate-500" />
          </MenuButton>
        </div>
      </FloatingMenu>

      <EditorContent editor={editor} className="px-6 py-5" />

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <span>
          {words} word{words === 1 ? "" : "s"}
          {uploading && <span className="ml-3 text-brand-700 dark:text-brand-400">Uploading image…</span>}
        </span>
        <span>Select text to format · Markdown shortcuts work too</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void uploadAndInsert(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
