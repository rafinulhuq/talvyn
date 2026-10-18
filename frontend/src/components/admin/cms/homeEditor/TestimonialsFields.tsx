import { Video, Image as ImageIcon } from "lucide-react";
import { arrayValue, cloneJson, getPath, moveItem, numberValue, stringValue, type JsonPath } from "@/lib/cms/jsonPath";
import type { JsonObject, JsonValue } from "@/types/cms";
import { FieldGrid, NumberField, TextField } from "../basicFields";
import { ImageUploadField } from "../ImageUploadField";
import { RepeatableList } from "../RepeatableList";
import { SectionHeadingFields } from "./SectionHeadingFields";

export function TestimonialsFields({ draft, update }: { draft: JsonObject; update: (path: JsonPath, value: JsonValue) => void }) {
  const quotes = arrayValue<JsonObject>(getPath(draft, ["testimonials", "quotes"]));
  return (
    <>
      <SectionHeadingFields draft={draft} update={update} path={["testimonials"]} />
      <RepeatableList<JsonObject>
        items={quotes}
        addLabel="Add Quote"
        emptyText="No testimonials yet."
        getTitle={(item, index) => stringValue(item.name, `Quote ${index + 1}`)}
        onAdd={() => update(["testimonials", "quotes"], [...quotes, { text: "", name: "", role: "", stars: 5, avatarUrl: "", videoUrl: "" }])}
        onMove={(from, to) => update(["testimonials", "quotes"], moveItem(quotes, from, to))}
        onDuplicate={(index) => update(["testimonials", "quotes"], [...quotes.slice(0, index + 1), cloneJson(quotes[index]), ...quotes.slice(index + 1)])}
        onRemove={(index) => update(["testimonials", "quotes"], quotes.filter((_, itemIndex) => itemIndex !== index))}
      >
        {(item, index) => (
          <>
            <FieldGrid>
              <TextField label="Name" value={stringValue(item.name)} onChange={(value) => update(["testimonials", "quotes", index, "name"], value)} />
              <TextField label="Role" value={stringValue(item.role)} onChange={(value) => update(["testimonials", "quotes", index, "role"], value)} />
              <NumberField label="Stars" min={1} max={5} value={numberValue(item.stars, 5)} onChange={(value) => update(["testimonials", "quotes", index, "stars"], value)} />
            </FieldGrid>
            <TextField label="Quote" multiline value={stringValue(item.text)} onChange={(value) => update(["testimonials", "quotes", index, "text"], value)} />

            {/* Person Image & Video Link */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3.5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                Media &amp; Testimonial Attachments
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                <ImageUploadField
                  label="Person Photo / Avatar"
                  placeholder="https://... or /images/..."
                  hint="Upload a headshot, or paste a direct image link."
                  altText={stringValue(item.name) ? `${stringValue(item.name)} headshot` : undefined}
                  value={stringValue(item.avatarUrl)}
                  onChange={(value) => update(["testimonials", "quotes", index, "avatarUrl"], value)}
                />

                <div>
                  <TextField
                    label="Video Testimonial Link (Optional)"
                    placeholder="https://youtube.com/..., vimeo, loom, or .mp4"
                    value={stringValue(item.videoUrl)}
                    onChange={(value) => update(["testimonials", "quotes", index, "videoUrl"], value)}
                  />
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                    <Video className="h-3 w-3 text-slate-400" />
                    Supports YouTube, Vimeo, Loom, or direct MP4 video URLs.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </RepeatableList>
    </>
  );
}
