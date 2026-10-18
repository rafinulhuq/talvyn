import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cmpApi } from "@/lib/api/cms";
import type {
  BlogPost,
  BlogPostStatus,
  BlogPostSummary,
  CmsAuthorProfile,
  CmsMediaAsset,
} from "@/types/cms";

export type StatusFilter = "all" | BlogPostStatus;
export type Message = { type: "success" | "error"; text: string } | null;

const PAGE_SIZE = 10;

export interface EditorState {
  id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  contentMd: string;
  coverImageAssetId: string | null;
  authorProfileId: string | null;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  status: BlogPostStatus;
  publishedAt: string | null;
}

const emptyEditor: EditorState = {
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  contentMd: "",
  coverImageAssetId: null,
  authorProfileId: null,
  tags: "",
  seoTitle: "",
  seoDescription: "",
  status: "draft",
  publishedAt: null,
};

function editorFromPost(post: BlogPost): EditorState {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    contentMd: post.content_md,
    coverImageAssetId: post.cover_image_asset_id,
    authorProfileId: post.author_profile_id,
    tags: post.tags.join(", "),
    seoTitle: post.seo_title ?? "",
    seoDescription: post.seo_description ?? "",
    status: post.status,
    publishedAt: post.published_at,
  };
}

function editorSnapshot(state: EditorState): string {
  return JSON.stringify([
    state.title,
    state.slug,
    state.excerpt,
    state.contentMd,
    state.coverImageAssetId,
    state.authorProfileId,
    state.tags,
    state.seoTitle,
    state.seoDescription,
  ]);
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isScheduled(status: BlogPostStatus, publishedAt: string | null): boolean {
  return status === "published" && !!publishedAt && new Date(publishedAt) > new Date();
}

// The editor panel's fields all change together when a post is opened,
// closed, or replaced with the server's copy after a save — grouped into
// one reducer so those transitions can't leave two fields disagreeing.
interface EditorPanelState {
  editor: EditorState | null;
  slugTouched: boolean;
  showPreview: boolean;
  confirmArchive: boolean;
  contentMode: "rich" | "markdown";
  autosaveState: "idle" | "saving" | "saved";
  publishPanelOpen: boolean;
  scheduleMode: "now" | "later";
  scheduleAt: string;
}

const initialEditorPanel: EditorPanelState = {
  editor: null,
  slugTouched: false,
  showPreview: false,
  confirmArchive: false,
  contentMode: "rich",
  autosaveState: "idle",
  publishPanelOpen: false,
  scheduleMode: "now",
  scheduleAt: "",
};

type EditorPanelAction =
  | { type: "opened"; editor: EditorState; slugTouched: boolean }
  | { type: "closed" }
  | { type: "fieldsPatched"; patch: Partial<EditorState> }
  | { type: "editorReplaced"; editor: EditorState }
  | { type: "savedFromServer"; editor: EditorState }
  | { type: "autosaveApplied"; data: BlogPost }
  | { type: "previewToggled" }
  | { type: "contentModeChanged"; mode: "rich" | "markdown" }
  | { type: "slugTouchedChanged"; value: boolean }
  | { type: "confirmArchiveChanged"; value: boolean }
  | { type: "publishPanelChanged"; open: boolean }
  | { type: "scheduleModeChanged"; mode: "now" | "later" }
  | { type: "scheduleAtChanged"; value: string }
  | { type: "autosaveStateChanged"; value: "idle" | "saving" | "saved" };

function editorPanelReducer(state: EditorPanelState, action: EditorPanelAction): EditorPanelState {
  switch (action.type) {
    case "opened":
      return { ...initialEditorPanel, editor: action.editor, slugTouched: action.slugTouched };
    case "closed":
      return { ...state, editor: null, confirmArchive: false };
    case "fieldsPatched":
      return state.editor ? { ...state, editor: { ...state.editor, ...action.patch } } : state;
    case "editorReplaced":
      return { ...state, editor: action.editor };
    case "savedFromServer":
      return { ...state, editor: action.editor, slugTouched: true };
    case "autosaveApplied":
      return state.editor
        ? {
            ...state,
            editor: {
              ...state.editor,
              id: action.data.id,
              status: action.data.status,
              publishedAt: action.data.published_at,
              slug: state.editor.slug.trim() ? state.editor.slug : action.data.slug,
            },
          }
        : state;
    case "previewToggled":
      return { ...state, showPreview: !state.showPreview };
    case "contentModeChanged":
      return { ...state, contentMode: action.mode };
    case "slugTouchedChanged":
      return { ...state, slugTouched: action.value };
    case "confirmArchiveChanged":
      return { ...state, confirmArchive: action.value };
    case "publishPanelChanged":
      return { ...state, publishPanelOpen: action.open };
    case "scheduleModeChanged":
      return { ...state, scheduleMode: action.mode };
    case "scheduleAtChanged":
      return { ...state, scheduleAt: action.value };
    case "autosaveStateChanged":
      return { ...state, autosaveState: action.value };
    default:
      return state;
  }
}

export function useBlogManagerFlow() {
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const [editorPanel, dispatchEditorPanel] = useReducer(editorPanelReducer, initialEditorPanel);
  const { editor } = editorPanel;
  const [editorBusy, setEditorBusy] = useState<"save" | "publish" | "unpublish" | "archive" | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<BlogPostSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Images uploaded from inside the editor this session.
  const [sessionMedia, setSessionMedia] = useState<CmsMediaAsset[]>([]);
  const [authors, setAuthors] = useState<CmsAuthorProfile[]>([]);
  const [newAuthorOpen, setNewAuthorOpen] = useState(false);
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newAuthorAvatarFile, setNewAuthorAvatarFile] = useState<File | null>(null);
  const [savingAuthor, setSavingAuthor] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const savingRef = useRef(false);

  const imageAssets = useMemo(
    () => sessionMedia.filter((asset) => asset.content_type.startsWith("image/")),
    [sessionMedia]
  );
  const coverAsset = imageAssets.find((asset) => asset.id === editor?.coverImageAssetId) ?? null;

  const loadPosts = useCallback(
    async (options: { offset?: number } = {}) => {
      const offset = options.offset ?? 0;
      if (offset > 0) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await cmpApi.listBlogPosts({
          status: statusFilter === "all" ? undefined : statusFilter,
          search: search.trim() || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        if (result.success) {
          setPosts((prev) => {
            if (offset === 0) return result.data.items;
            const known = new Set(prev.map((item) => item.id));
            return [...prev, ...result.data.items.filter((item) => !known.has(item.id))];
          });
          setTotal(result.data.total);
        } else {
          setMessage({ type: "error", text: result.error.message });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => void loadPosts(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadPosts, search]);

  useEffect(() => {
    void cmpApi.listAuthors().then((result) => {
      if (result.success) setAuthors(result.data.items);
    });
  }, []);

  function openNewPost() {
    dispatchEditorPanel({ type: "opened", editor: { ...emptyEditor }, slugTouched: false });
    setMessage(null);
    lastSavedSnapshotRef.current = null;
  }

  async function openPost(postId: string) {
    setMessage(null);
    const result = await cmpApi.getBlogPost(postId);
    if (result.success) {
      const state = editorFromPost(result.data);
      dispatchEditorPanel({ type: "opened", editor: state, slugTouched: true });
      lastSavedSnapshotRef.current = editorSnapshot(state);
    } else {
      setMessage({ type: "error", text: result.error.message });
    }
  }

  async function uploadEditorImage(file: File): Promise<CmsMediaAsset | null> {
    const result = await cmpApi.uploadMedia(file, {});
    if (result.success) {
      setSessionMedia((prev) => [result.data, ...prev]);
      return result.data;
    }
    setMessage({ type: "error", text: result.error.message });
    return null;
  }

  async function createAuthor() {
    if (!newAuthorName.trim()) return;
    setSavingAuthor(true);
    try {
      let avatarAssetId: string | undefined;
      if (newAuthorAvatarFile) {
        const uploaded = await uploadEditorImage(newAuthorAvatarFile);
        if (uploaded) avatarAssetId = uploaded.id;
      }
      const result = await cmpApi.createAuthor({ name: newAuthorName.trim(), avatar_asset_id: avatarAssetId });
      if (result.success) {
        setAuthors((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
        updateEditor({ authorProfileId: result.data.id });
        setNewAuthorOpen(false);
        setNewAuthorName("");
        setNewAuthorAvatarFile(null);
      } else {
        setMessage({ type: "error", text: result.error.message });
      }
    } finally {
      setSavingAuthor(false);
    }
  }

  function closeEditor() {
    dispatchEditorPanel({ type: "closed" });
    void loadPosts();
  }

  function updateEditor(patch: Partial<EditorState>) {
    dispatchEditorPanel({ type: "fieldsPatched", patch });
  }

  async function savePost(
    options: { updateStateFromServer?: boolean } = {}
  ): Promise<BlogPost | null> {
    const { updateStateFromServer = true } = options;
    if (!editor) return null;
    if (!editor.title.trim()) {
      setMessage({ type: "error", text: "Give the post a title first." });
      return null;
    }

    const payload = {
      title: editor.title.trim(),
      slug: editor.slug.trim() || undefined,
      excerpt: editor.excerpt.trim() || null,
      content_md: editor.contentMd,
      cover_image_asset_id: editor.coverImageAssetId ?? undefined,
      clear_cover_image: editor.coverImageAssetId === null,
      author_profile_id: editor.authorProfileId ?? undefined,
      clear_author_profile: editor.authorProfileId === null,
      tags: parseTags(editor.tags),
      seo_title: editor.seoTitle.trim() || null,
      seo_description: editor.seoDescription.trim() || null,
    };

    const result = editor.id
      ? await cmpApi.updateBlogPost(editor.id, payload)
      : await cmpApi.createBlogPost(payload);

    if (!result.success) {
      setMessage({ type: "error", text: result.error.message });
      return null;
    }

    if (updateStateFromServer) {
      const state = editorFromPost(result.data);
      dispatchEditorPanel({ type: "savedFromServer", editor: state });
      lastSavedSnapshotRef.current = editorSnapshot(state);
    } else {
      // Autosave path — keep whatever the user typed while the request was
      // in flight; only adopt server-owned fields.
      dispatchEditorPanel({ type: "autosaveApplied", data: result.data });
    }
    return result.data;
  }

  async function handleSave() {
    setEditorBusy("save");
    setMessage(null);
    const saved = await savePost();
    if (saved) {
      setMessage({
        type: "success",
        text: saved.status === "published" ? "Saved — changes are live." : "Draft saved.",
      });
    }
    setEditorBusy(null);
  }

  async function handlePublish(publishAt?: string) {
    setEditorBusy("publish");
    setMessage(null);
    const saved = await savePost();
    if (saved) {
      const result = await cmpApi.publishBlogPost(saved.id, publishAt);
      if (result.success) {
        dispatchEditorPanel({ type: "editorReplaced", editor: editorFromPost(result.data) });
        setMessage({
          type: "success",
          text: isScheduled(result.data.status, result.data.published_at)
            ? `Scheduled for ${formatDate(result.data.published_at)}`
            : `Published — live at /blog/${result.data.slug}`,
        });
      } else {
        setMessage({ type: "error", text: result.error.message });
      }
    }
    setEditorBusy(null);
  }

  async function handleUnpublish() {
    if (!editor?.id) return;
    setEditorBusy("unpublish");
    setMessage(null);
    const result = await cmpApi.unpublishBlogPost(editor.id);
    if (result.success) {
      dispatchEditorPanel({ type: "editorReplaced", editor: editorFromPost(result.data) });
      setMessage({ type: "success", text: "Post unpublished — it is now a draft." });
    } else {
      setMessage({ type: "error", text: result.error.message });
    }
    setEditorBusy(null);
  }

  async function handleArchive() {
    if (!editor?.id) return;
    setEditorBusy("archive");
    setMessage(null);
    const result = await cmpApi.archiveBlogPost(editor.id);
    if (result.success) {
      setMessage({ type: "success", text: "Post deleted." });
      closeEditor();
    } else {
      setMessage({ type: "error", text: result.error.message });
    }
    setEditorBusy(null);
  }

  async function handleDeleteFromList() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setMessage(null);
    try {
      const result = await cmpApi.archiveBlogPost(deleteTarget.id);
      if (result.success) {
        setPosts((prev) => prev.filter((post) => post.id !== deleteTarget.id));
        setTotal((prev) => Math.max(0, prev - 1));
        setMessage({ type: "success", text: "Post deleted." });
        setDeleteTarget(null);
      } else {
        setMessage({ type: "error", text: result.error.message });
        setDeleteTarget(null);
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  // Medium-style autosave: drafts save ~2.5s after the last edit. Published
  // posts are never autosaved — pushing live changes stays an explicit act.
  useEffect(() => {
    if (!editor || editor.status !== "draft" || !editor.title.trim()) return;
    const snapshot = editorSnapshot(editor);
    if (snapshot === lastSavedSnapshotRef.current) return;

    const timer = setTimeout(() => {
      if (savingRef.current || editorBusy) return;
      savingRef.current = true;
      dispatchEditorPanel({ type: "autosaveStateChanged", value: "saving" });
      void savePost({ updateStateFromServer: false })
        .then((saved) => {
          if (saved) {
            lastSavedSnapshotRef.current = snapshot;
            dispatchEditorPanel({ type: "autosaveStateChanged", value: "saved" });
          } else {
            dispatchEditorPanel({ type: "autosaveStateChanged", value: "idle" });
          }
        })
        .finally(() => {
          savingRef.current = false;
        });
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editorBusy]);

  return {
    posts,
    total,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    loading,
    loadingMore,
    message,
    editorPanel,
    dispatchEditorPanel,
    editorBusy,
    deleteTarget,
    setDeleteTarget,
    deleteBusy,
    imageAssets,
    coverAsset,
    authors,
    newAuthorOpen,
    setNewAuthorOpen,
    newAuthorName,
    setNewAuthorName,
    newAuthorAvatarFile,
    setNewAuthorAvatarFile,
    savingAuthor,
    coverUploading,
    setCoverUploading,
    loadPosts,
    openNewPost,
    openPost,
    uploadEditorImage,
    createAuthor,
    closeEditor,
    updateEditor,
    handleSave,
    handlePublish,
    handleUnpublish,
    handleArchive,
    handleDeleteFromList,
  };
}
