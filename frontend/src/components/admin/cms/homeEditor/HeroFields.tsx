import { getPath, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import { linkAt } from "@/lib/cms/draftHelpers";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, LinkFields, TextField } from "../basicFields";

export function HeroFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  return (
    <>
      <FieldGrid>
        <TextField label="Eyebrow" value={stringValue(getPath(draft, ["hero", "eyebrow"]))} onChange={(value) => update(["hero", "eyebrow"], value)} />
        <TextField label="Title Prefix" value={stringValue(getPath(draft, ["hero", "titlePrefix"]))} onChange={(value) => update(["hero", "titlePrefix"], value)} />
        <TextField label="Title Highlight" value={stringValue(getPath(draft, ["hero", "titleHighlight"]))} onChange={(value) => update(["hero", "titleHighlight"], value)} />
        <TextField label="Helper Text" value={stringValue(getPath(draft, ["hero", "helperText"]))} onChange={(value) => update(["hero", "helperText"], value)} />
      </FieldGrid>
      <TextField label="Body" multiline value={stringValue(getPath(draft, ["hero", "body"]))} onChange={(value) => update(["hero", "body"], value)} />
      <LinkFields label="Primary CTA" value={linkAt(draft, ["hero", "primaryCta"])} onChange={(value) => update(["hero", "primaryCta"], value as unknown as JsonObject)} />
      <LinkFields label="Secondary CTA" value={linkAt(draft, ["hero", "secondaryCta"])} onChange={(value) => update(["hero", "secondaryCta"], value as unknown as JsonObject)} />
    </>
  );
}
