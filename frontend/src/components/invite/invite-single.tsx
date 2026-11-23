"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import type { CreateInvitationResult } from "@/types/invitation";
import type { TestSummary } from "@/types/test";
import { ALL_TESTS, ManualLink, TestScopeField } from "./shared";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteSingle({ jdId, tests }: { jdId: string; tests: TestSummary[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState(ALL_TESTS);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<{ link: string; who: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : "Enter the candidate's name.",
      email: EMAIL.test(email.trim()) ? undefined : "Enter a valid email address.",
    };
    setErrors(next);
    if (next.name || next.email) return;
    setBusy(true);
    setFormError(undefined);
    setManual(null);
    const res = await api<CreateInvitationResult>("/api/v1/invitations/", {
      method: "POST",
      body: { candidate_name: name.trim(), candidate_email: email.trim(), jd_id: jdId, ...(scope !== ALL_TESTS ? { test_id: scope } : {}) },
    });
    setBusy(false);
    if (!res.ok) {
      if (res.error.code === "DUPLICATE_INVITATION") return setErrors({ email: "This person already has an open invitation for this role. Resend it from Candidates instead." });
      return setFormError(res.error.message);
    }
    const who = name.trim();
    if (res.data.magic_link && !res.data.email_sent) setManual({ link: res.data.magic_link, who });
    else toast({ title: "Invitation sent", description: `${who} has until ${formatDate(res.data.expires_at)} to start.`, tone: "success" });
    setName("");
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      {manual && <ManualLink link={manual.link} who={manual.who} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}>
          <Input value={name} autoComplete="off" onChange={(e) => (setName(e.target.value), setErrors((x) => ({ ...x, name: undefined })))} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={email} autoComplete="off" onChange={(e) => (setEmail(e.target.value), setErrors((x) => ({ ...x, email: undefined })))} />
        </Field>
      </div>
      <TestScopeField tests={tests} value={scope} onChange={setScope} />
      <p className="text-sm text-ink-muted">They get an email with a private link that only works for them. Resending it gives them more time.</p>
      <div>
        <Button type="submit" variant="primary" loading={busy}>
          Send invitation
        </Button>
      </div>
    </form>
  );
}
