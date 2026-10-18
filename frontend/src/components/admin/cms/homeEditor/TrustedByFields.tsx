import { getPath, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import { stringArrayAt } from "@/lib/cms/draftHelpers";
import type { JsonObject, JsonValue } from "@/types/cms";
import { TextField } from "../basicFields";
import { StringListEditor } from "../RepeatableList";

export function TrustedByFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  const companies = stringArrayAt(draft, ["trustedBy", "companies"]);
  return (
    <>
      <TextField label="Eyebrow" value={stringValue(getPath(draft, ["trustedBy", "eyebrow"]))} onChange={(value) => update(["trustedBy", "eyebrow"], value)} />
      <StringListEditor items={companies} addLabel="Add Company" emptyText="No company names yet." onChange={(items) => update(["trustedBy", "companies"], items)} />
    </>
  );
}
