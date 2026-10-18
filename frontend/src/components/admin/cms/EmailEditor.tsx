import { Eye } from "lucide-react";
import { getPath, stringValue } from "@/lib/cms/jsonPath";
import { useDraftPath } from "@/lib/cms/draftHelpers";
import { sectionCardProps, sampleVariables, type SectionControls } from "@/lib/cms/cmsConfig";
import { defaultInvitationEmailContent, template, type InvitationEmailContent } from "@/lib/cms/content";
import type { JsonObject } from "@/types/cms";
import { FieldGrid, TextField } from "./basicFields";
import { SectionCard } from "./SectionCard";

export function EmailEditor({
  draft,
  setDraft,
  controls,
}: {
  draft: JsonObject;
  setDraft: (draft: JsonObject) => void;
  controls: SectionControls;
}) {
  const update = useDraftPath(draft, setDraft);
  const email = mergeEmailTemplate(draft);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <SectionCard
          title="Envelope"
          description="Subject line and inbox preview"
          {...sectionCardProps(controls, "envelope")}
        >
          <TextField label="Subject" value={stringValue(getPath(draft, ["subject"]))} onChange={(value) => update(["subject"], value)} />
          <TextField label="Preheader" value={stringValue(getPath(draft, ["preheader"]))} onChange={(value) => update(["preheader"], value)} />
        </SectionCard>

        <SectionCard
          title="Header And Body"
          description="Main email message"
          {...sectionCardProps(controls, "headerBody")}
        >
          <TextField label="Heading" value={stringValue(getPath(draft, ["heading"]))} onChange={(value) => update(["heading"], value)} />
          <TextField label="Greeting" value={stringValue(getPath(draft, ["greeting"]))} onChange={(value) => update(["greeting"], value)} />
          <TextField label="Intro" multiline value={stringValue(getPath(draft, ["intro"]))} onChange={(value) => update(["intro"], value)} />
        </SectionCard>

        <SectionCard
          title="Assessment Details"
          description="Included tests and call to action copy"
          {...sectionCardProps(controls, "details")}
        >
          <FieldGrid>
            <TextField label="Included Label" value={stringValue(getPath(draft, ["includedLabel"]))} onChange={(value) => update(["includedLabel"], value)} />
            <TextField label="CTA Label" value={stringValue(getPath(draft, ["ctaLabel"]))} onChange={(value) => update(["ctaLabel"], value)} />
            <TextField label="Expiry Label" value={stringValue(getPath(draft, ["expiryLabel"]))} onChange={(value) => update(["expiryLabel"], value)} />
            <TextField label="Fallback Label" value={stringValue(getPath(draft, ["fallbackLabel"]))} onChange={(value) => update(["fallbackLabel"], value)} />
          </FieldGrid>
          <TextField label="Expiry Body" multiline value={stringValue(getPath(draft, ["expiryBody"]))} onChange={(value) => update(["expiryBody"], value)} />
          <TextField label="Instructions" multiline value={stringValue(getPath(draft, ["instructions"]))} onChange={(value) => update(["instructions"], value)} />
        </SectionCard>

        <SectionCard
          title="Footer"
          description="Sender and disclaimer copy"
          {...sectionCardProps(controls, "footerCopy")}
        >
          <TextField label="Footer" multiline value={stringValue(getPath(draft, ["footer"]))} onChange={(value) => update(["footer"], value)} />
        </SectionCard>
      </div>

      <EmailPreview email={email} />
    </div>
  );
}

function mergeEmailTemplate(draft: JsonObject): InvitationEmailContent {
  return {
    subject: stringValue(draft.subject, defaultInvitationEmailContent.subject),
    preheader: stringValue(draft.preheader, defaultInvitationEmailContent.preheader),
    heading: stringValue(draft.heading, defaultInvitationEmailContent.heading),
    greeting: stringValue(draft.greeting, defaultInvitationEmailContent.greeting),
    intro: stringValue(draft.intro, defaultInvitationEmailContent.intro),
    includedLabel: stringValue(draft.includedLabel, defaultInvitationEmailContent.includedLabel),
    ctaLabel: stringValue(draft.ctaLabel, defaultInvitationEmailContent.ctaLabel),
    expiryLabel: stringValue(draft.expiryLabel, defaultInvitationEmailContent.expiryLabel),
    expiryBody: stringValue(draft.expiryBody, defaultInvitationEmailContent.expiryBody),
    fallbackLabel: stringValue(draft.fallbackLabel, defaultInvitationEmailContent.fallbackLabel),
    instructions: stringValue(draft.instructions, defaultInvitationEmailContent.instructions),
    footer: stringValue(draft.footer, defaultInvitationEmailContent.footer),
  };
}

function EmailPreview({ email }: { email: InvitationEmailContent }) {
  return (
    <aside className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-4 xl:sticky xl:top-4 xl:self-start">
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Email Preview</h3>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-500">
          {template(email.subject, sampleVariables)}
        </p>
        <h4 className="mt-3 text-lg font-semibold text-slate-900">
          {template(email.heading, sampleVariables)}
        </h4>
        <p className="mt-2 text-sm text-slate-700">
          {template(email.greeting, sampleVariables)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {template(email.intro, sampleVariables)}
        </p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {email.includedLabel}
          </p>
          <p className="mt-1 text-sm text-slate-700">Technical Screening</p>
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          {email.ctaLabel}
        </button>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          {template(email.footer, sampleVariables)}
        </p>
      </div>
    </aside>
  );
}
