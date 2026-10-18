import { getPath, arrayValue, stringValue, booleanValue } from "@/lib/cms/jsonPath";
import { useDraftPath, linkAt } from "@/lib/cms/draftHelpers";
import { sectionCardProps, type SectionControls } from "@/lib/cms/cmsConfig";
import type { JsonObject } from "@/types/cms";
import { FieldGrid, LinkFields, TextField, ToggleField } from "./basicFields";
import { SectionCard } from "./SectionCard";
import { LinkListEditor } from "./RepeatableList";

export function SiteEditor({
  draft,
  setDraft,
  controls,
}: {
  draft: JsonObject;
  setDraft: (draft: JsonObject) => void;
  controls: SectionControls;
}) {
  const update = useDraftPath(draft, setDraft);
  const navLinks = arrayValue<JsonObject>(getPath(draft, ["navLinks"]));
  const footerLinks = arrayValue<JsonObject>(getPath(draft, ["footerLinks"]));

  return (
    <div className="space-y-4">
      <SectionCard
        title="SEO Metadata"
        description="Page title, search description, and robots settings"
        {...sectionCardProps(controls, "seo")}
      >
        <FieldGrid>
          <TextField label="Title" value={stringValue(getPath(draft, ["metadata", "title"]))} onChange={(value) => update(["metadata", "title"], value)} />
          <TextField label="Title Template" value={stringValue(getPath(draft, ["metadata", "titleTemplate"]))} onChange={(value) => update(["metadata", "titleTemplate"], value)} />
        </FieldGrid>
        <TextField label="Description" multiline value={stringValue(getPath(draft, ["metadata", "description"]))} onChange={(value) => update(["metadata", "description"], value)} />
        <FieldGrid>
          <ToggleField label="Allow indexing" checked={booleanValue(getPath(draft, ["metadata", "robotsIndex"]))} onChange={(value) => update(["metadata", "robotsIndex"], value)} />
          <ToggleField label="Allow following links" checked={booleanValue(getPath(draft, ["metadata", "robotsFollow"]))} onChange={(value) => update(["metadata", "robotsFollow"], value)} />
        </FieldGrid>
      </SectionCard>

      <SectionCard
        title="Brand"
        description="Name and short positioning line"
        {...sectionCardProps(controls, "brand")}
      >
        <FieldGrid>
          <TextField label="Name" value={stringValue(getPath(draft, ["brand", "name"]))} onChange={(value) => update(["brand", "name"], value)} />
          <TextField label="Tagline" value={stringValue(getPath(draft, ["brand", "tagline"]))} onChange={(value) => update(["brand", "tagline"], value)} />
        </FieldGrid>
      </SectionCard>

      <SectionCard
        title="Navigation Links"
        description="Top navigation links"
        {...sectionCardProps(controls, "nav")}
      >
        <LinkListEditor items={navLinks} onChange={(items) => update(["navLinks"], items)} addLabel="Add Nav Link" emptyText="No navigation links yet." />
      </SectionCard>

      <SectionCard
        title="Header Actions"
        description="Login and primary call to action"
        {...sectionCardProps(controls, "headerActions")}
      >
        <LinkFields label="Login" value={linkAt(draft, ["navActions", "login"])} onChange={(value) => update(["navActions", "login"], value as unknown as JsonObject)} />
        <LinkFields label="Primary" value={linkAt(draft, ["navActions", "primary"])} onChange={(value) => update(["navActions", "primary"], value as unknown as JsonObject)} />
      </SectionCard>

      <SectionCard
        title="Footer"
        description="Footer links and copyright"
        {...sectionCardProps(controls, "footer")}
      >
        <LinkListEditor items={footerLinks} onChange={(items) => update(["footerLinks"], items)} addLabel="Add Footer Link" emptyText="No footer links yet." />
        <TextField label="Copyright" value={stringValue(getPath(draft, ["footerCopyright"]))} onChange={(value) => update(["footerCopyright"], value)} />
      </SectionCard>
    </div>
  );
}
