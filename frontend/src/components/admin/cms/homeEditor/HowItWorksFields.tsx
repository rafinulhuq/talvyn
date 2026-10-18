import { arrayValue, cloneJson, getPath, moveItem, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import { colorOptions, iconOptions } from "@/lib/cms/cmsConfig";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, SelectField, TextField } from "../basicFields";
import { RepeatableList } from "../RepeatableList";
import { SectionHeadingFields } from "./SectionHeadingFields";

export function HowItWorksFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  const steps = arrayValue<JsonObject>(getPath(draft, ["howItWorks", "steps"]));
  const mediaType = stringValue(getPath(draft, ["howItWorks", "media", "type"]), "video");
  return (
    <>
      <SectionHeadingFields draft={draft} update={update} path={["howItWorks"]} />
      <div className="rounded-lg bg-white dark:bg-slate-900 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Walkthrough media (optional)
        </p>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Add a hosted video or animated GIF to show the product in action.
          Leave the URL blank to keep the 4-step grid only.
        </p>
        <FieldGrid>
          <SelectField
            label="Media type"
            value={mediaType}
            options={["video", "image"]}
            onChange={(value) => update(["howItWorks", "media", "type"], value)}
          />
          <TextField
            label="Media URL"
            value={stringValue(getPath(draft, ["howItWorks", "media", "src"]))}
            onChange={(value) => update(["howItWorks", "media", "src"], value)}
          />
          {mediaType === "video" && (
            <TextField
              label="Poster image URL"
              value={stringValue(getPath(draft, ["howItWorks", "media", "poster"]))}
              onChange={(value) => update(["howItWorks", "media", "poster"], value)}
            />
          )}
          <TextField
            label="Caption"
            value={stringValue(getPath(draft, ["howItWorks", "media", "caption"]))}
            onChange={(value) => update(["howItWorks", "media", "caption"], value)}
          />
        </FieldGrid>
      </div>
      <RepeatableList<JsonObject>
        items={steps}
        addLabel="Add Step"
        emptyText="No process steps yet."
        getTitle={(item, index) => stringValue(item.title, `Step ${index + 1}`)}
        onAdd={() => update(["howItWorks", "steps"], [...steps, { step: `${steps.length + 1}`.padStart(2, "0"), title: "", body: "", icon: "file-text", color: "brand" }])}
        onMove={(from, to) => update(["howItWorks", "steps"], moveItem(steps, from, to))}
        onDuplicate={(index) => update(["howItWorks", "steps"], [...steps.slice(0, index + 1), cloneJson(steps[index]), ...steps.slice(index + 1)])}
        onRemove={(index) => update(["howItWorks", "steps"], steps.filter((_, itemIndex) => itemIndex !== index))}
      >
        {(item, index) => (
          <>
            <FieldGrid>
              <TextField label="Step" value={stringValue(item.step)} onChange={(value) => update(["howItWorks", "steps", index, "step"], value)} />
              <TextField label="Title" value={stringValue(item.title)} onChange={(value) => update(["howItWorks", "steps", index, "title"], value)} />
              <SelectField label="Icon" value={stringValue(item.icon, "file-text")} options={iconOptions} onChange={(value) => update(["howItWorks", "steps", index, "icon"], value)} />
              <SelectField label="Color" value={stringValue(item.color, "brand")} options={colorOptions} onChange={(value) => update(["howItWorks", "steps", index, "color"], value)} />
            </FieldGrid>
            <TextField label="Body" multiline value={stringValue(item.body)} onChange={(value) => update(["howItWorks", "steps", index, "body"], value)} />
          </>
        )}
      </RepeatableList>
    </>
  );
}
