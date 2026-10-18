import { getPath, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import { linkAt } from "@/lib/cms/draftHelpers";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, LinkFields, TextField } from "../basicFields";

export function FinalCtaFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  return (
    <>
      <FieldGrid>
        <TextField label="Eyebrow" value={stringValue(getPath(draft, ["finalCta", "eyebrow"]))} onChange={(value) => update(["finalCta", "eyebrow"], value)} />
        <TextField label="Title" value={stringValue(getPath(draft, ["finalCta", "title"]))} onChange={(value) => update(["finalCta", "title"], value)} />
        <TextField label="Helper Text" value={stringValue(getPath(draft, ["finalCta", "helperText"]))} onChange={(value) => update(["finalCta", "helperText"], value)} />
      </FieldGrid>
      <TextField label="Body" multiline value={stringValue(getPath(draft, ["finalCta", "body"]))} onChange={(value) => update(["finalCta", "body"], value)} />
      <LinkFields label="Primary CTA" value={linkAt(draft, ["finalCta", "primaryCta"])} onChange={(value) => update(["finalCta", "primaryCta"], value as unknown as JsonObject)} />
      <LinkFields label="Secondary CTA" value={linkAt(draft, ["finalCta", "secondaryCta"])} onChange={(value) => update(["finalCta", "secondaryCta"], value as unknown as JsonObject)} />
    </>
  );
}
