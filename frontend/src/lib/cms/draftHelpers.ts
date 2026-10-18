import type { CmsLink } from "@/lib/cms/content";
import type { JsonObject, JsonValue } from "@/types/cms";
import { arrayValue, getPath, objectValue, setPath, stringValue, type JsonPath } from "./jsonPath";

export function useDraftPath(draft: JsonObject, setDraft: (draft: JsonObject) => void) {
  return (path: JsonPath, value: JsonValue) => setDraft(setPath(draft, path, value));
}

export function linkAt(draft: JsonObject, path: JsonPath): CmsLink {
  const value = objectValue(getPath(draft, path));
  return {
    label: stringValue(value.label),
    href: stringValue(value.href),
  };
}

export function objectAt(draft: JsonObject, path: JsonPath): JsonObject {
  return objectValue(getPath(draft, path));
}

export function stringArrayAt(draft: JsonObject, path: JsonPath): string[] {
  return arrayValue(getPath(draft, path)).map((item) => stringValue(item));
}
