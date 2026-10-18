import { getPath, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, TextField } from "../basicFields";

export function SectionHeadingFields({
  draft,
  update,
  path,
}: {
  draft: JsonObject;
  update: (path: JsonPath, value: JsonValue) => void;
  path: JsonPath;
}) {
  return (
    <>
      <FieldGrid>
        <TextField label="Eyebrow" value={stringValue(getPath(draft, [...path, "eyebrow"]))} onChange={(value) => update([...path, "eyebrow"], value)} />
        <TextField label="Title" value={stringValue(getPath(draft, [...path, "title"]))} onChange={(value) => update([...path, "title"], value)} />
        <TextField label="Highlight" value={stringValue(getPath(draft, [...path, "highlight"]))} onChange={(value) => update([...path, "highlight"], value)} />
      </FieldGrid>
      <TextField label="Body" multiline value={stringValue(getPath(draft, [...path, "body"]))} onChange={(value) => update([...path, "body"], value)} />
    </>
  );
}
