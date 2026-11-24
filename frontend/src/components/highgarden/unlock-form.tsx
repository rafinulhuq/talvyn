"use client";

import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { api } from "@/lib/api/client";

/** Step 1 passphrase → step 2 the 6-digit code emailed to the Highgarden owner. */
export function UnlockForm({ initialStep }: { initialStep: "passphrase" | "code" }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [passphrase, setPassphrase] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submitPassphrase(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await api("/api/highgarden/unlock", { method: "POST", base: "", body: { passphrase } });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setPassphrase("");
    setStep("code");
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await api("/api/highgarden/verify-otp", { method: "POST", base: "", body: { code } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      // Expired or out of attempts: the server cleared the code, so start over.
      if (res.error.code === "CODE_EXPIRED") {
        setCode("");
        setStep("passphrase");
      }
      return;
    }
    router.replace("/dashboard/highgarden");
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="flex flex-col gap-4" data-hg-ignore>
        <Alert tone="info" title="Check the Highgarden owner's inbox">
          We emailed a 6-digit code to the fixed owner address. It expires in 5 minutes and allows 5 tries.
        </Alert>
        <Field label="Verification code" error={error}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="font-mono tracking-[0.3em] tabular-nums"
          />
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6}>
            <MailCheck aria-hidden className="size-4" /> Verify and unlock
          </Button>
          <Button type="button" variant="ghost" onClick={() => (setStep("passphrase"), setError(undefined), setCode(""))}>
            Start over
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassphrase} className="flex flex-col gap-4" data-hg-ignore>
      <Field label="Highgarden passphrase" error={error} hint="This is separate from your account password.">
        <PasswordInput name="passphrase" autoComplete="off" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={busy} disabled={!passphrase}>
          Continue
        </Button>
      </div>
    </form>
  );
}
