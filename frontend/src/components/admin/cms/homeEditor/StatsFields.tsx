import { arrayValue, cloneJson, getPath, moveItem, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import { iconOptions } from "@/lib/cms/cmsConfig";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, SelectField, TextField } from "../basicFields";
import { RepeatableList } from "../RepeatableList";

export function StatsFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  const stats = arrayValue<JsonObject>(getPath(draft, ["stats"]));
  return (
    <RepeatableList<JsonObject>
      items={stats}
      addLabel="Add Stat"
      emptyText="No stats yet."
      getTitle={(item, index) => stringValue(item.label, `Stat ${index + 1}`)}
      onAdd={() => update(["stats"], [...stats, { value: "", label: "", icon: "bar-chart" }])}
      onMove={(from, to) => update(["stats"], moveItem(stats, from, to))}
      onDuplicate={(index) => update(["stats"], [...stats.slice(0, index + 1), cloneJson(stats[index]), ...stats.slice(index + 1)])}
      onRemove={(index) => update(["stats"], stats.filter((_, itemIndex) => itemIndex !== index))}
    >
      {(item, index) => (
        <FieldGrid>
          <TextField label="Value" value={stringValue(item.value)} onChange={(value) => update(["stats", index, "value"], value)} />
          <TextField label="Label" value={stringValue(item.label)} onChange={(value) => update(["stats", index, "label"], value)} />
          <SelectField label="Icon" value={stringValue(item.icon, "bar-chart")} options={iconOptions} onChange={(value) => update(["stats", index, "icon"], value)} />
        </FieldGrid>
      )}
    </RepeatableList>
  );
}
