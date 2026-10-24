"use client";

import { RefreshCw } from "lucide-react";
import { clsx } from "clsx";

import { BlogManager } from "@/components/admin/BlogManager";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { tabConfigs } from "@/lib/cms/cmsConfig";
import { useCmsClientFlow } from "@/hooks/useCmsClientFlow";
import { StatusMessage } from "@/components/admin/cms/basicFields";
import { DocumentSidebar } from "@/components/admin/cms/DocumentSidebar";
import { DocumentToolbar } from "@/components/admin/cms/DocumentToolbar";
import { VersionHistoryPanel } from "@/components/admin/cms/VersionHistoryPanel";
import { DraftSummary } from "@/components/admin/cms/DraftSummary";
import { VisualEditor } from "@/components/admin/cms/VisualEditor";

export function CmpClient() {
  const {
    activeTab,
    setActiveTab,
    documents,
    activeKey,
    draft,
    setDraft,
    versions,
    versionsTotal,
    versionsLoadingMore,
    confirmingRestore,
    setConfirmingRestore,
    busy,
    message,
    activeDoc,
    activeConfig,
    hasLocalChanges,
    sections,
    editedSections,
    setExpandedSections,
    sectionControls,
    jumpToSection,
    loadCms,
    loadMoreVersions,
    selectDocument,
    saveDraft,
    publishDraft,
    restoreVersion,
  } = useCmsClientFlow();

  const ActiveIcon = activeConfig.icon;

  return (
    <div className="w-full">
      <PageHeader
        title="CMP"
        subtitle="Public site, candidate experience, invitation email, and media content."
        actions={
          <button
            type="button"
            onClick={loadCms}
            disabled={busy === "load"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181A1F] px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:border-white/20 hover:text-[#F2D74E] disabled:opacity-50"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", busy === "load" && "animate-spin")} />
            <span>Refresh</span>
          </button>
        }
      />

      <div className="mb-6 flex w-fit items-center gap-1.5 rounded-xl border border-white/10 bg-[#181A1F] p-1 shadow-2xs">
        {tabConfigs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "bg-[#F2D74E] text-[#1A1600] font-semibold shadow-xs"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
            >
              <TabIcon className={clsx("h-4 w-4", isActive ? "text-[#1A1600]" : "text-white/70")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "blog" && <BlogManager />}

      {activeTab === "content" && (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <DocumentSidebar
            documents={documents}
            activeKey={activeKey}
            onSelectDocument={selectDocument}
            activeDoc={activeDoc}
            sections={sections}
            editedSections={editedSections}
            onJumpToSection={jumpToSection}
            onExpandAll={() => setExpandedSections(new Set(sections.map((section) => section.id)))}
            onCollapseAll={() => setExpandedSections(new Set())}
          />

          <main className="space-y-5">
            <StatusMessage message={message} />

            {activeDoc && (
              <>
                <DocumentToolbar
                  icon={ActiveIcon}
                  label={activeConfig.label}
                  publishedAt={activeDoc.published_at}
                  hasLocalChanges={hasLocalChanges}
                  busy={busy}
                  onSave={() => void saveDraft()}
                  onPublish={() => void publishDraft()}
                />

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <VisualEditor
                      activeKey={activeKey}
                      draft={draft}
                      setDraft={setDraft}
                      controls={sectionControls}
                    />
                  </div>

                  <aside className="space-y-4">
                    <DraftSummary activeKey={activeKey} draft={draft} />

                    <VersionHistoryPanel
                      versions={versions}
                      versionsTotal={versionsTotal}
                      versionsLoadingMore={versionsLoadingMore}
                      confirmingRestore={confirmingRestore}
                      onConfirmRestore={setConfirmingRestore}
                      busy={busy}
                      onRestore={(version) => void restoreVersion(version)}
                      onLoadMore={() => void loadMoreVersions()}
                    />
                  </aside>
                </div>
              </>
            )}

            {!activeDoc && busy !== "load" && (
              <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No CMP documents are available.
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
