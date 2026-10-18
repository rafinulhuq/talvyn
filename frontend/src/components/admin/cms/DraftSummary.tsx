import { Eye } from "lucide-react";
import { getPath, stringValue } from "@/lib/cms/jsonPath";
import { normalizeHomeOrder } from "@/lib/cms/cmsConfig";
import type { CmsDocumentKey } from "@/lib/cms/content";
import type { JsonObject } from "@/types/cms";

export function DraftSummary({ activeKey, draft }: { activeKey: CmsDocumentKey; draft: JsonObject }) {
  const heading =
    activeKey === "site"
      ? stringValue(getPath(draft, ["brand", "name"]), "Site")
      : activeKey === "home"
        ? `${stringValue(getPath(draft, ["hero", "titlePrefix"]))} ${stringValue(getPath(draft, ["hero", "titleHighlight"]))}`.trim()
        : activeKey === "candidate_experience"
          ? stringValue(getPath(draft, ["completion", "heading"]), "Candidate experience")
          : stringValue(getPath(draft, ["subject"]), "Invitation email");

  const chips =
    activeKey === "home"
      ? normalizeHomeOrder(getPath(draft, ["sectionOrder"]))
      : Object.keys(draft);

  return (
    <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Draft Summary</h3>
      </div>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{heading || "Untitled draft"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((key) => (
          <span key={key} className="rounded-lg bg-white px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}
