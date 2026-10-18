"use client";

import { clsx } from "clsx";
import { useBlogManagerFlow } from "@/hooks/useBlogManagerFlow";
import { BlogPostListView } from "./blogManager/BlogPostListView";
import { BlogEditorTopBar } from "./blogManager/BlogEditorTopBar";
import { BlogPostPreview } from "./blogManager/BlogPostPreview";
import { BlogEditorFields } from "./blogManager/BlogEditorFields";
import { BlogPublishPanel } from "./blogManager/BlogPublishPanel";

export function BlogManager() {
  const {
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
    coverAsset,
    authors,
    newAuthorOpen,
    setNewAuthorOpen,
    newAuthorName,
    setNewAuthorName,
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
  } = useBlogManagerFlow();

  const {
    editor,
    slugTouched,
    showPreview,
    confirmArchive,
    contentMode,
    autosaveState,
    publishPanelOpen,
    scheduleMode,
    scheduleAt,
  } = editorPanel;

  const messageBanner = message && (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-sm",
        message.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-danger/20 bg-danger-light text-danger-dark"
      )}
      role="status"
    >
      {message.text}
    </div>
  );

  if (editor) {
    return (
      <div className="space-y-5">
        {messageBanner}

        <BlogEditorTopBar
          editor={editor}
          showPreview={showPreview}
          autosaveState={autosaveState}
          editorBusy={editorBusy}
          onClose={closeEditor}
          onTogglePreview={() => dispatchEditorPanel({ type: "previewToggled" })}
          onSave={() => void handleSave()}
          onOpenPublishPanel={() => dispatchEditorPanel({ type: "publishPanelChanged", open: true })}
          onUnpublish={() => void handleUnpublish()}
        />

        {showPreview ? (
          <BlogPostPreview editor={editor} coverAsset={coverAsset} />
        ) : (
          <BlogEditorFields
            editor={editor}
            slugTouched={slugTouched}
            contentMode={contentMode}
            onContentModeChange={(mode) => dispatchEditorPanel({ type: "contentModeChanged", mode })}
            onUpdate={updateEditor}
            onUploadImage={uploadEditorImage}
          />
        )}

        {publishPanelOpen && (
          <BlogPublishPanel
            editor={editor}
            onUpdate={updateEditor}
            onSlugTouched={() => dispatchEditorPanel({ type: "slugTouchedChanged", value: true })}
            onClose={() => dispatchEditorPanel({ type: "publishPanelChanged", open: false })}
            coverAsset={coverAsset}
            coverUploading={coverUploading}
            onUploadCover={async (file) => {
              setCoverUploading(true);
              try {
                const asset = await uploadEditorImage(file);
                if (asset) updateEditor({ coverImageAssetId: asset.id });
              } finally {
                setCoverUploading(false);
              }
            }}
            authors={authors}
            newAuthorOpen={newAuthorOpen}
            onNewAuthorOpenChange={setNewAuthorOpen}
            newAuthorName={newAuthorName}
            onNewAuthorNameChange={setNewAuthorName}
            onNewAuthorAvatarFileChange={setNewAuthorAvatarFile}
            savingAuthor={savingAuthor}
            onCreateAuthor={() => void createAuthor()}
            scheduleMode={scheduleMode}
            onScheduleModeChange={(mode) => dispatchEditorPanel({ type: "scheduleModeChanged", mode })}
            scheduleAt={scheduleAt}
            onScheduleAtChange={(value) => dispatchEditorPanel({ type: "scheduleAtChanged", value })}
            editorBusy={editorBusy}
            onPublish={() => {
              const publishAt =
                scheduleMode === "later" && scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
              void handlePublish(publishAt).then(() =>
                dispatchEditorPanel({ type: "publishPanelChanged", open: false })
              );
            }}
            confirmArchive={confirmArchive}
            onConfirmArchiveChange={(value) => dispatchEditorPanel({ type: "confirmArchiveChanged", value })}
            onArchive={() => void handleArchive()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {messageBanner}

      <BlogPostListView
        posts={posts}
        total={total}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        loading={loading}
        loadingMore={loadingMore}
        onNewPost={openNewPost}
        onOpenPost={(id) => void openPost(id)}
        onLoadMore={() => void loadPosts({ offset: posts.length })}
        deleteTarget={deleteTarget}
        onRequestDelete={setDeleteTarget}
        onCancelDelete={() => setDeleteTarget(null)}
        onConfirmDelete={() => void handleDeleteFromList()}
        deleteBusy={deleteBusy}
      />
    </div>
  );
}
