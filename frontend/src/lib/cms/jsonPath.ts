import type { JsonObject, JsonValue } from "@/types/cms";

export type JsonPath = Array<string | number>;

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function objectValue(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

export function arrayValue<T extends JsonValue = JsonValue>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function getPath(root: JsonObject, path: JsonPath): unknown {
  return path.reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)];
    if (isJsonObject(current)) return current[String(key)];
    return undefined;
  }, root);
}

export function setPath(root: JsonObject, path: JsonPath, value: JsonValue): JsonObject {
  const next = cloneJson(root);
  let cursor: Record<string, unknown> | unknown[] = next;

  path.slice(0, -1).forEach((key, index) => {
    const nextKey = path[index + 1];
    const current = Array.isArray(cursor) ? cursor[Number(key)] : cursor[String(key)];
    const replacement =
      Array.isArray(current) || isJsonObject(current)
        ? cloneJson(current)
        : typeof nextKey === "number"
          ? []
          : {};

    if (Array.isArray(cursor)) cursor[Number(key)] = replacement;
    else cursor[String(key)] = replacement;
    cursor = replacement as Record<string, unknown> | unknown[];
  });

  const finalKey = path[path.length - 1];
  if (Array.isArray(cursor)) cursor[Number(finalKey)] = value;
  else cursor[String(finalKey)] = value;
  return next;
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  if (fromIndex >= items.length || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function deepMerge(base: JsonObject, override: unknown): JsonObject {
  if (!isJsonObject(override)) return cloneJson(base);
  const merged = cloneJson(base);
  Object.entries(override).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = cloneJson(value) as JsonValue;
      return;
    }
    if (isJsonObject(merged[key]) && isJsonObject(value)) {
      merged[key] = deepMerge(merged[key] as JsonObject, value);
      return;
    }
    merged[key] = cloneJson(value) as JsonValue;
  });
  return merged;
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
