import { useEffect, useMemo, useState } from "react";
import { cmpApi } from "@/lib/api/cms";
import type { CmsDocumentKey } from "@/lib/cms/content";
import {
  defaultDraftForKey,
  documentConfigs,
  normalizeDraft,
  sectionsForDocument,
  type CmsMessage,
  type CmsTab,
  type JsonPathBusyState,
  type SectionControls,
} from "@/lib/cms/cmsConfig";
import { jsonEqual } from "@/lib/cms/jsonPath";
import type { CmsDocument, CmsVersionMeta, JsonObject } from "@/types/cms";

export function useCmsClientFlow() {
  const [activeTab, setActiveTab] = useState<CmsTab>("content");
  const [documents, setDocuments] = useState<CmsDocument[]>([]);
  const [activeKey, setActiveKey] = useState<CmsDocumentKey>("site");
  const [draft, setDraft] = useState<JsonObject>(() => defaultDraftForKey("site"));
  const [versions, setVersions] = useState<CmsVersionMeta[]>([]);
  const [versionsTotal, setVersionsTotal] = useState(0);
  const [versionsLoadingMore, setVersionsLoadingMore] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState<number | null>(null);
  const [busy, setBusy] = useState<JsonPathBusyState>("load");
  const [message, setMessage] = useState<CmsMessage>(null);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const activeDoc = documents.find((doc) => doc.key === activeKey) ?? null;
  const activeConfig = documentConfigs.find((doc) => doc.key === activeKey) ?? documentConfigs[0];

  const hasLocalChanges = useMemo(() => {
    if (!activeDoc) return false;
    return !jsonEqual(draft, normalizeDraft(activeDoc.key, activeDoc.draft_json));
  }, [activeDoc, draft]);

  const sections = useMemo(() => sectionsForDocument(activeKey, draft), [activeKey, draft]);

  const editedSections = useMemo(() => {
    const edited = new Set<string>();
    if (!activeDoc?.published_json) return edited;
    const published = normalizeDraft(activeDoc.key, activeDoc.published_json);
    sections.forEach((section) => {
      if (section.keys.some((key) => !jsonEqual(draft[key], published[key]))) {
        edited.add(section.id);
      }
    });
    return edited;
  }, [activeDoc, draft, sections]);

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function jumpToSection(id: string) {
    setExpandedSections((prev) => new Set(prev).add(id));
    // Wait a frame so a freshly expanded card exists before scrolling to it.
    requestAnimationFrame(() => {
      document
        .getElementById(`cms-section-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const sectionControls: SectionControls = {
    expanded: expandedSections,
    edited: editedSections,
    toggle: toggleSection,
  };

  async function loadVersions(key: CmsDocumentKey) {
    setConfirmingRestore(null);
    const result = await cmpApi.listVersions(key);
    setVersions(result.success ? result.data.items : []);
    setVersionsTotal(result.success ? result.data.total : 0);
  }

  async function loadMoreVersions() {
    setVersionsLoadingMore(true);
    try {
      const result = await cmpApi.listVersions(activeKey, { offset: versions.length });
      if (result.success) {
        const { items, total } = result.data;
        setVersions((prev) => {
          const known = new Set(prev.map((item) => item.id));
          return [...prev, ...items.filter((item) => !known.has(item.id))];
        });
        setVersionsTotal(total);
      }
    } finally {
      setVersionsLoadingMore(false);
    }
  }

  async function loadCms() {
    setBusy("load");
    setMessage(null);
    const docsResult = await cmpApi.listDocuments();

    if (!docsResult.success) {
      setMessage({ type: "error", text: docsResult.error.message });
      setBusy(null);
      return;
    }

    const items = docsResult.data.items;
    setDocuments(items);
    const current = items.find((doc) => doc.key === activeKey) ?? items[0];
    if (current) {
      setActiveKey(current.key);
      setDraft(normalizeDraft(current.key, current.draft_json));
      void loadVersions(current.key);
    }

    setBusy(null);
  }

  useEffect(() => {
    // Canonical fetch-on-mount — loadCms's setBusy/setMessage/etc are the
    // expected UI feedback for that fetch, not derived-state cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectDocument(key: CmsDocumentKey) {
    const doc = documents.find((item) => item.key === key);
    setActiveKey(key);
    setMessage(null);
    setExpandedSections(new Set());
    setDraft(doc ? normalizeDraft(doc.key, doc.draft_json) : defaultDraftForKey(key));
    void loadVersions(key);
  }

  function replaceDocument(nextDoc: CmsDocument) {
    setDocuments((prev) => prev.map((doc) => (doc.key === nextDoc.key ? nextDoc : doc)));
    if (nextDoc.key === activeKey) setDraft(normalizeDraft(nextDoc.key, nextDoc.draft_json));
  }

  async function saveDraft() {
    setBusy("save");
    setMessage(null);
    const result = await cmpApi.updateDocument(activeKey, draft);
    if (result.success) {
      replaceDocument(result.data);
      setMessage({ type: "success", text: "Draft saved." });
    } else {
      setMessage({ type: "error", text: result.error.message });
    }
    setBusy(null);
  }

  async function publishDraft() {
    setBusy("publish");
    setMessage(null);

    if (hasLocalChanges) {
      const saveResult = await cmpApi.updateDocument(activeKey, draft);
      if (!saveResult.success) {
        setMessage({ type: "error", text: saveResult.error.message });
        setBusy(null);
        return;
      }
      replaceDocument(saveResult.data);
    }

    const result = await cmpApi.publishDocument(activeKey);
    if (result.success) {
      replaceDocument(result.data.document);
      await loadVersions(activeKey);
      setMessage({ type: "success", text: `Published version ${result.data.version.version}.` });
    } else {
      setMessage({ type: "error", text: result.error.message });
    }
    setBusy(null);
  }

  async function restoreVersion(version: number) {
    setBusy("restore");
    setMessage(null);
    const result = await cmpApi.restoreVersion(activeKey, version);
    if (result.success) {
      replaceDocument(result.data);
      setMessage({
        type: "success",
        text: `Version ${version} restored as draft. Click Publish to make it live.`,
      });
    } else {
      setMessage({ type: "error", text: result.error.message });
    }
    setConfirmingRestore(null);
    setBusy(null);
  }

  return {
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
    expandedSections,
    setExpandedSections,
    sectionControls,
    jumpToSection,
    loadCms,
    loadMoreVersions,
    selectDocument,
    saveDraft,
    publishDraft,
    restoreVersion,
  };
}
