import type { CmsDocumentKey } from "@/lib/cms/content";
import type { SectionControls } from "@/lib/cms/cmsConfig";
import type { JsonObject } from "@/types/cms";
import { SiteEditor } from "./SiteEditor";
import { CandidateEditor } from "./CandidateEditor";
import { EmailEditor } from "./EmailEditor";
import { HomeEditor } from "./homeEditor/HomeEditor";

export function VisualEditor({
  activeKey,
  draft,
  setDraft,
  controls,
}: {
  activeKey: CmsDocumentKey;
  draft: JsonObject;
  setDraft: (draft: JsonObject) => void;
  controls: SectionControls;
}) {
  if (activeKey === "site") return <SiteEditor draft={draft} setDraft={setDraft} controls={controls} />;
  if (activeKey === "home") return <HomeEditor draft={draft} setDraft={setDraft} controls={controls} />;
  if (activeKey === "candidate_experience") {
    return <CandidateEditor draft={draft} setDraft={setDraft} controls={controls} />;
  }
  return <EmailEditor draft={draft} setDraft={setDraft} controls={controls} />;
}
