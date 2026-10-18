import { getPath, isJsonObject, objectValue, stringValue } from "@/lib/cms/jsonPath";
import { useDraftPath, objectAt, stringArrayAt } from "@/lib/cms/draftHelpers";
import { sectionCardProps, type SectionControls } from "@/lib/cms/cmsConfig";
import type { JsonObject } from "@/types/cms";
import { FieldGrid, TextField } from "./basicFields";
import { SectionCard } from "./SectionCard";
import { StringListEditor } from "./RepeatableList";

export function CandidateEditor({
  draft,
  setDraft,
  controls,
}: {
  draft: JsonObject;
  setDraft: (draft: JsonObject) => void;
  controls: SectionControls;
}) {
  const update = useDraftPath(draft, setDraft);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Invitation Landing"
        description="Candidate invitation page copy"
        {...sectionCardProps(controls, "invitationLanding")}
      >
        <FieldGrid>
          <TextField label="Eyebrow" value={stringValue(getPath(draft, ["invitationLanding", "eyebrow"]))} onChange={(value) => update(["invitationLanding", "eyebrow"], value)} />
          <TextField label="Greeting" value={stringValue(getPath(draft, ["invitationLanding", "greeting"]))} onChange={(value) => update(["invitationLanding", "greeting"], value)} />
          <TextField label="Next Up Label" value={stringValue(getPath(draft, ["invitationLanding", "nextUpLabel"]))} onChange={(value) => update(["invitationLanding", "nextUpLabel"], value)} />
          <TextField label="What You Will Complete Label" value={stringValue(getPath(draft, ["invitationLanding", "whatYouWillCompleteLabel"]))} onChange={(value) => update(["invitationLanding", "whatYouWillCompleteLabel"], value)} />
          <TextField label="Link Expiry Label" value={stringValue(getPath(draft, ["invitationLanding", "linkExpiryLabel"]))} onChange={(value) => update(["invitationLanding", "linkExpiryLabel"], value)} />
          <TextField label="Expires In Label" value={stringValue(getPath(draft, ["invitationLanding", "expiresInLabel"]))} onChange={(value) => update(["invitationLanding", "expiresInLabel"], value)} />
          <TextField label="Valid Until Label" value={stringValue(getPath(draft, ["invitationLanding", "validUntilLabel"]))} onChange={(value) => update(["invitationLanding", "validUntilLabel"], value)} />
          <TextField label="Before You Begin Title" value={stringValue(getPath(draft, ["invitationLanding", "beforeYouBeginTitle"]))} onChange={(value) => update(["invitationLanding", "beforeYouBeginTitle"], value)} />
        </FieldGrid>
        <StringListEditor
          items={stringArrayAt(draft, ["invitationLanding", "instructions"])}
          addLabel="Add Instruction"
          emptyText="No instructions yet."
          onChange={(items) => update(["invitationLanding", "instructions"], items)}
        />
      </SectionCard>

      <SectionCard
        title="Sectioned Exam Landing"
        description="Before-start section overview"
        {...sectionCardProps(controls, "sectionedExamLanding")}
      >
        <FieldGrid>
          <TextField label="Section Overview Label" value={stringValue(getPath(draft, ["sectionedExamLanding", "sectionOverviewLabel"]))} onChange={(value) => update(["sectionedExamLanding", "sectionOverviewLabel"], value)} />
          <TextField label="Section Meta" value={stringValue(getPath(draft, ["sectionedExamLanding", "sectionMeta"]))} onChange={(value) => update(["sectionedExamLanding", "sectionMeta"], value)} />
        </FieldGrid>
        <StringListEditor
          items={stringArrayAt(draft, ["sectionedExamLanding", "instructions"])}
          addLabel="Add Instruction"
          emptyText="No section instructions yet."
          onChange={(items) => update(["sectionedExamLanding", "instructions"], items)}
        />
      </SectionCard>

      <SectionCard
        title="Apply Landing"
        description="Public application page copy"
        {...sectionCardProps(controls, "applyLanding")}
      >
        <FieldGrid>
          <TextField label="Eyebrow" value={stringValue(getPath(draft, ["applyLanding", "eyebrow"]))} onChange={(value) => update(["applyLanding", "eyebrow"], value)} />
          <TextField label="Fallback Title" value={stringValue(getPath(draft, ["applyLanding", "fallbackTitle"]))} onChange={(value) => update(["applyLanding", "fallbackTitle"], value)} />
          <TextField label="What You Will Complete Label" value={stringValue(getPath(draft, ["applyLanding", "whatYouWillCompleteLabel"]))} onChange={(value) => update(["applyLanding", "whatYouWillCompleteLabel"], value)} />
        </FieldGrid>
        <TextField label="Body" multiline value={stringValue(getPath(draft, ["applyLanding", "body"]))} onChange={(value) => update(["applyLanding", "body"], value)} />
      </SectionCard>

      <StateCopyEditor
        title="Invalid Invitation States"
        states={objectAt(draft, ["invalidInvitation"])}
        onChange={(states) => update(["invalidInvitation"], states)}
        cardProps={sectionCardProps(controls, "invalidInvitation")}
      />

      <StateCopyEditor
        title="Invalid Public Link States"
        states={objectAt(draft, ["invalidPublicLink"])}
        onChange={(states) => update(["invalidPublicLink"], states)}
        cardProps={sectionCardProps(controls, "invalidPublicLink")}
      />

      <SectionCard
        title="Completion Page"
        description="After-submit copy"
        {...sectionCardProps(controls, "completion")}
      >
        <FieldGrid>
          <TextField label="Heading" value={stringValue(getPath(draft, ["completion", "heading"]))} onChange={(value) => update(["completion", "heading"], value)} />
          <TextField label="Next Title" value={stringValue(getPath(draft, ["completion", "nextTitle"]))} onChange={(value) => update(["completion", "nextTitle"], value)} />
        </FieldGrid>
        <TextField label="Body" multiline value={stringValue(getPath(draft, ["completion", "body"]))} onChange={(value) => update(["completion", "body"], value)} />
        <StringListEditor
          items={stringArrayAt(draft, ["completion", "nextItems"])}
          addLabel="Add Next Item"
          emptyText="No next-step items yet."
          onChange={(items) => update(["completion", "nextItems"], items)}
        />
      </SectionCard>

      <SectionCard
        title="Expired Page"
        description="Expired standalone page copy"
        {...sectionCardProps(controls, "expiredPage")}
      >
        <FieldGrid>
          <TextField label="Heading" value={stringValue(getPath(draft, ["expiredPage", "heading"]))} onChange={(value) => update(["expiredPage", "heading"], value)} />
          <TextField label="Next Title" value={stringValue(getPath(draft, ["expiredPage", "nextTitle"]))} onChange={(value) => update(["expiredPage", "nextTitle"], value)} />
        </FieldGrid>
        <TextField label="Body" multiline value={stringValue(getPath(draft, ["expiredPage", "body"]))} onChange={(value) => update(["expiredPage", "body"], value)} />
        <TextField label="Next Body" multiline value={stringValue(getPath(draft, ["expiredPage", "nextBody"]))} onChange={(value) => update(["expiredPage", "nextBody"], value)} />
      </SectionCard>
    </div>
  );
}

function StateCopyEditor({
  title,
  states,
  onChange,
  cardProps,
}: {
  title: string;
  states: JsonObject;
  onChange: (states: JsonObject) => void;
  cardProps?: ReturnType<typeof sectionCardProps>;
}) {
  const entries = Object.entries(states).filter(([, value]) => isJsonObject(value));

  return (
    <SectionCard title={title} description="Heading and body for each error state" {...cardProps}>
      <div className="space-y-3">
        {entries.map(([key, value]) => {
          const state = objectValue(value);
          return (
            <div key={key} className="rounded-xl bg-white dark:bg-slate-900 p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{key}</p>
              <FieldGrid>
                <TextField
                  label="Heading"
                  value={stringValue(state.heading)}
                  onChange={(next) => onChange({ ...states, [key]: { ...state, heading: next } })}
                />
                <TextField
                  label="Body"
                  value={stringValue(state.body)}
                  onChange={(next) => onChange({ ...states, [key]: { ...state, body: next } })}
                />
              </FieldGrid>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
