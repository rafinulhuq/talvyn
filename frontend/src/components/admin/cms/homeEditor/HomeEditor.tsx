import { useRef } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getPath, moveItem } from "@/lib/cms/jsonPath";
import { useDraftPath } from "@/lib/cms/draftHelpers";
import { homeSectionConfigs, normalizeHomeOrder, sectionCardProps, type SectionControls } from "@/lib/cms/cmsConfig";
import type { HomeSectionKey } from "@/lib/cms/content";
import type { JsonObject } from "@/types/cms";
import { SectionCard } from "../SectionCard";
import { HomeSectionFields } from "./HomeSectionFields";

export function HomeEditor({
  draft,
  setDraft,
  controls,
}: {
  draft: JsonObject;
  setDraft: (draft: JsonObject) => void;
  controls: SectionControls;
}) {
  const update = useDraftPath(draft, setDraft);
  const dragIndex = useRef<number | null>(null);
  const sectionOrder = normalizeHomeOrder(getPath(draft, ["sectionOrder"]));
  const hiddenSections = homeSectionConfigs.filter((section) => !sectionOrder.includes(section.key));

  function moveSection(fromIndex: number, toIndex: number) {
    update(["sectionOrder"], moveItem(sectionOrder, fromIndex, toIndex));
  }

  function removeSection(key: HomeSectionKey) {
    update(
      ["sectionOrder"],
      sectionOrder.filter((item) => item !== key)
    );
  }

  function addSection(key: HomeSectionKey) {
    update(["sectionOrder"], [...sectionOrder, key]);
  }

  return (
    <div className="space-y-4">
      {hiddenSections.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          {hiddenSections.map((section) => (
            <Button
              key={section.key}
              size="sm"
              variant="outline"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => addSection(section.key)}
            >
              {section.label}
            </Button>
          ))}
        </div>
      )}

      {sectionOrder.map((sectionKey, index) => {
        const config = homeSectionConfigs.find((section) => section.key === sectionKey);
        if (!config) return null;
        return (
          <SectionCard
            key={sectionKey}
            title={config.label}
            description={config.description}
            {...sectionCardProps(controls, sectionKey)}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex.current !== null) moveSection(dragIndex.current, index);
              dragIndex.current = null;
            }}
            toolbar={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveSection(index, index - 1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={index === sectionOrder.length - 1}
                  onClick={() => moveSection(index, index + 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Hide" onClick={() => removeSection(sectionKey)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            }
          >
            <HomeSectionFields sectionKey={sectionKey} draft={draft} update={update} />
          </SectionCard>
        );
      })}

      {sectionOrder.length === 0 && (
        <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Add a homepage section to start rebuilding the page.
        </div>
      )}
    </div>
  );
}
