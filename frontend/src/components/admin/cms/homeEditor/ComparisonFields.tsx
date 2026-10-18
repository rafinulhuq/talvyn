import { arrayValue, cloneJson, getPath, moveItem, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, TextField } from "../basicFields";
import { RepeatableList } from "../RepeatableList";
import { SectionHeadingFields } from "./SectionHeadingFields";

export function ComparisonFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  const rows = arrayValue<JsonObject>(getPath(draft, ["comparison", "rows"]));
  return (
    <>
      <SectionHeadingFields draft={draft} update={update} path={["comparison"]} />
      <FieldGrid>
        <TextField label="Old Label" value={stringValue(getPath(draft, ["comparison", "oldLabel"]))} onChange={(value) => update(["comparison", "oldLabel"], value)} />
        <TextField label="New Label" value={stringValue(getPath(draft, ["comparison", "newLabel"]))} onChange={(value) => update(["comparison", "newLabel"], value)} />
      </FieldGrid>
      <RepeatableList<JsonObject>
        items={rows}
        addLabel="Add Row"
        emptyText="No comparison rows yet."
        getTitle={(item, index) => stringValue(item.label, `Row ${index + 1}`)}
        onAdd={() => update(["comparison", "rows"], [...rows, { label: "", old: "", now: "" }])}
        onMove={(from, to) => update(["comparison", "rows"], moveItem(rows, from, to))}
        onDuplicate={(index) => update(["comparison", "rows"], [...rows.slice(0, index + 1), cloneJson(rows[index]), ...rows.slice(index + 1)])}
        onRemove={(index) => update(["comparison", "rows"], rows.filter((_, itemIndex) => itemIndex !== index))}
      >
        {(item, index) => (
          <FieldGrid>
            <TextField label="Label" value={stringValue(item.label)} onChange={(value) => update(["comparison", "rows", index, "label"], value)} />
            <TextField label="Old" value={stringValue(item.old)} onChange={(value) => update(["comparison", "rows", index, "old"], value)} />
            <TextField label="Now" value={stringValue(item.now)} onChange={(value) => update(["comparison", "rows", index, "now"], value)} />
          </FieldGrid>
        )}
      </RepeatableList>
    </>
  );
}
