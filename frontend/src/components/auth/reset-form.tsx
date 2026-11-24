"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { z } from "@/lib/zod";
import { passwordConfirmationSchema } from "@/lib/auth/password-policy";
import { api } from "@/lib/api/client";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [failure, setFailure] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { password: String(f.get("password") ?? ""), confirmPassword: String(f.get("confirmPassword") ?? "") };
    const parsed = passwordConfirmationSchema.safeParse(body);
    setFailure(undefined);
    if (!parsed.success) {
      const fe = z.flattenError(parsed.error).fieldErrors;
      return setErrors({ password: fe.password?.[0], confirmPassword: fe.confirmPassword?.[0] });
    }
    setErrors({});
    setLoading(true);
    const res = await api("/api/password/reset", { base: "", method: "POST", body: { ...body, token } });
    if (!res.ok) {
      setLoading(false);
      return setFailure(res.error.message);
    }
    router.replace("/login?reset=1");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {failure && <Alert tone="danger" title="Couldn't reset your password">{failure}</Alert>}
      <Field label="New password" hint="At least 8 characters. Signing in again is required on every device." error={errors.password}>
        <PasswordInput name="password" autoComplete="new-password" autoFocus required />
      </Field>
      <Field label="Confirm new password" error={errors.confirmPassword}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" loading={loading} className="w-full">
        {loading ? "Saving password" : "Save password"}
      </Button>
    </form>
  );
}
