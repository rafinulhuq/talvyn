import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { documentConfigs, type SectionMeta } from "@/lib/cms/cmsConfig";
import type { CmsDocumentKey } from "@/lib/cms/content";
import type { CmsDocument } from "@/types/cms";

interface Props {
  documents: CmsDocument[];
  activeKey: CmsDocumentKey;
  onSelectDocument: (key: CmsDocumentKey) => void;
  activeDoc: CmsDocument | null;
  sections: SectionMeta[];
  editedSections: Set<string>;
  onJumpToSection: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function DocumentSidebar({
  documents,
  activeKey,
  onSelectDocument,
  activeDoc,
  sections,
  editedSections,
  onJumpToSection,
  onExpandAll,
  onCollapseAll,
}: Props) {
  return (
    <aside className="space-y-3">
      {documentConfigs.map((config) => {
        const Icon = config.icon;
        const doc = documents.find((item) => item.key === config.key);
        const selected = activeKey === config.key;
        return (
          <button
            key={config.key}
            type="button"
            onClick={() => onSelectDocument(config.key)}
            className={clsx(
              "flex w-full items-start gap-3 rounded-2xl p-4 text-left transition-colors duration-150",
              selected
                ? "bg-slate-200 dark:bg-slate-800"
                : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            )}
          >
            <span
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-slate-900",
                selected ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{config.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{config.description}</span>
              <span className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                v{doc?.latest_version ?? 0}
                {doc?.has_unpublished_changes && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                    Draft
                  </span>
                )}
              </span>
            </span>
          </button>
        );
      })}

      {activeDoc && sections.length > 0 && (
        <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-3 lg:sticky lg:top-4">
          <p className="mb-2 px-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            On this page
          </p>
          <nav className="space-y-0.5">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onJumpToSection(section.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-600 dark:text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-50"
              >
                <span className="truncate">{section.label}</span>
                {editedSections.has(section.id) && (
                  <span
                    className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                    title="Has unpublished edits"
                  />
                )}
              </button>
            ))}
          </nav>
          <div className="mt-2 flex gap-1 border-t border-slate-200 dark:border-slate-700 pt-2">
            <Button size="sm" variant="ghost" onClick={onExpandAll}>
              Expand all
            </Button>
            <Button size="sm" variant="ghost" onClick={onCollapseAll}>
              Collapse all
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
