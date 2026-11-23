"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { testTypeLabel } from "@/lib/domain/test";
import type { TestSummary } from "@/types/test";

export const ALL_TESTS = "__all__";

/** Which approved tests the candidate is invited to. Default: all of them, in order. */
export function TestScopeField({ tests, value, onChange }: { tests: TestSummary[]; value: string; onChange: (v: string) => void }) {
  if (tests.length < 2) return null;
  return (
    <Field label="Tests" hint={value === ALL_TESTS ? `Candidates take all ${tests.length} approved tests, one after another.` : "Candidates take only this test."}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TESTS}>All approved tests ({tests.length})</SelectItem>
          {tests.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {testTypeLabel(t.test_type)}: {t.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function CopyButton({ value, label = "Copy link", size = "sm" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the link and copy it by hand.", tone: "danger" });
    }
  }
  return (
    <Button type="button" variant="secondary" size={size} onClick={() => void copy()}>
      {done ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </Button>
  );
}

/** Shown when the backend couldn't email the candidate and returned the link instead. */
export function ManualLink({ link, who }: { link: string; who: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-warning/40 bg-warning-soft p-4">
      <p className="text-base font-medium text-ink">The email to {who} wasn&apos;t sent</p>
      <p className="text-base text-ink-muted">The invitation exists. Send this private link yourself; it works once and expires with the invitation.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink">{link}</code>
        <CopyButton value={link} />
      </div>
    </div>
  );
}
