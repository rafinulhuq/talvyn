import { arrayValue, cloneJson, getPath, moveItem, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import { iconOptions } from "@/lib/cms/cmsConfig";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, SelectField, TextField } from "../basicFields";
import { RepeatableList } from "../RepeatableList";
import { SectionHeadingFields } from "./SectionHeadingFields";

export function FeaturesFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  const items = arrayValue<JsonObject>(getPath(draft, ["features", "items"]));
  return (
    <>
      <SectionHeadingFields draft={draft} update={update} path={["features"]} />
      <RepeatableList<JsonObject>
        items={items}
        addLabel="Add Feature"
        emptyText="No feature cards yet."
        getTitle={(item, index) => stringValue(item.title, `Feature ${index + 1}`)}
        onAdd={() => update(["features", "items"], [...items, { icon: "sparkles", title: "", body: "" }])}
        onMove={(from, to) => update(["features", "items"], moveItem(items, from, to))}
        onDuplicate={(index) => update(["features", "items"], [...items.slice(0, index + 1), cloneJson(items[index]), ...items.slice(index + 1)])}
        onRemove={(index) => update(["features", "items"], items.filter((_, itemIndex) => itemIndex !== index))}
      >
        {(item, index) => (
          <>
            <FieldGrid>
              <TextField label="Title" value={stringValue(item.title)} onChange={(value) => update(["features", "items", index, "title"], value)} />
              <SelectField label="Icon" value={stringValue(item.icon, "sparkles")} options={iconOptions} onChange={(value) => update(["features", "items", index, "icon"], value)} />
            </FieldGrid>
            <TextField label="Body" multiline value={stringValue(item.body)} onChange={(value) => update(["features", "items", index, "body"], value)} />
          </>
        )}
      </RepeatableList>
    </>
  );
}
