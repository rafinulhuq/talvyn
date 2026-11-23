"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { tidyExtractedText } from "@/lib/domain/jd";

/** The job description text. Editable: fixing extraction mistakes here improves the skills and tests. */
export function JdTextPanel({ jdId, text, hasSkills }: { jdId: string; text: string; hasSkills: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft.trim()) return setError("The description can't be empty.");
    setSaving(true);
    const res = await api(`/api/v1/jd/${jdId}/text`, { method: "PATCH", body: { raw_text: draft } });
    setSaving(false);
    if (!res.ok) return setError(res.error.message);
    setEditing(false);
    setError(undefined);
    toast({ title: "Description saved", description: hasSkills ? "Re-run the analysis to update the skills." : undefined, tone: "success" });
    router.refresh();
  }

  return (
    <Panel
      title="Job description"
      actions={
        !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil aria-hidden className="size-3.5" /> Edit
          </Button>
        )
      }
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Job description text"
            className="min-h-96 font-sans text-md leading-relaxed"
            maxLength={100_000}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(text);
                setEditing(false);
                setError(undefined);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              {saving ? "Saving" : "Save description"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap text-md leading-relaxed text-ink">{tidyExtractedText(text)}</div>
      )}
    </Panel>
  );
}
