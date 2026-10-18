import { arrayValue, cloneJson, getPath, moveItem, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import { colorOptions, iconOptions } from "@/lib/cms/cmsConfig";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, SelectField, TextField } from "../basicFields";
import { RepeatableList, StringListEditor } from "../RepeatableList";
import { SectionHeadingFields } from "./SectionHeadingFields";

export function AssessmentTypesFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  const items = arrayValue<JsonObject>(getPath(draft, ["assessmentTypes", "items"]));
  return (
    <>
      <SectionHeadingFields draft={draft} update={update} path={["assessmentTypes"]} />
      <RepeatableList<JsonObject>
        items={items}
        addLabel="Add Assessment Type"
        emptyText="No assessment types yet."
        getTitle={(item, index) => stringValue(item.label, `Assessment ${index + 1}`)}
        onAdd={() => update(["assessmentTypes", "items"], [...items, { icon: "code", label: "", color: "brand", description: "", tags: [] }])}
        onMove={(from, to) => update(["assessmentTypes", "items"], moveItem(items, from, to))}
        onDuplicate={(index) => update(["assessmentTypes", "items"], [...items.slice(0, index + 1), cloneJson(items[index]), ...items.slice(index + 1)])}
        onRemove={(index) => update(["assessmentTypes", "items"], items.filter((_, itemIndex) => itemIndex !== index))}
      >
        {(item, index) => {
          const tags = arrayValue(getPath(draft, ["assessmentTypes", "items", index, "tags"])).map((tag) => stringValue(tag));
          return (
            <>
              <FieldGrid>
                <TextField label="Label" value={stringValue(item.label)} onChange={(value) => update(["assessmentTypes", "items", index, "label"], value)} />
                <SelectField label="Icon" value={stringValue(item.icon, "code")} options={iconOptions} onChange={(value) => update(["assessmentTypes", "items", index, "icon"], value)} />
                <SelectField label="Color" value={stringValue(item.color, "brand")} options={colorOptions} onChange={(value) => update(["assessmentTypes", "items", index, "color"], value)} />
              </FieldGrid>
              <TextField label="Description" multiline value={stringValue(item.description)} onChange={(value) => update(["assessmentTypes", "items", index, "description"], value)} />
              <StringListEditor items={tags} addLabel="Add Tag" emptyText="No tags yet." onChange={(nextTags) => update(["assessmentTypes", "items", index, "tags"], nextTags)} />
            </>
          );
        }}
      </RepeatableList>
    </>
  );
}
