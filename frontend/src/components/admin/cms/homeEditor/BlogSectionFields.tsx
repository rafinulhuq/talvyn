import { getPath, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import type { JsonObject, JsonValue } from "@/types/cms";
import { TextField } from "../basicFields";
import { SectionHeadingFields } from "./SectionHeadingFields";

export function BlogSectionFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  return (
    <>
      <SectionHeadingFields draft={draft} update={update} path={["blog"]} />
      <TextField label="CTA Label" value={stringValue(getPath(draft, ["blog", "ctaLabel"]))} onChange={(value) => update(["blog", "ctaLabel"], value)} />
      <p className="text-xs text-slate-400">
        The three most recent published posts appear here automatically. The section hides
        itself when no posts are published.
      </p>
    </>
  );
}
