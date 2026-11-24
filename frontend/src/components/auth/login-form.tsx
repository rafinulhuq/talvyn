"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "@/lib/zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export function LoginForm({ callbackUrl, notice }: { callbackUrl: string; notice?: "reset" | "requested" }) {
  const router = useRouter();
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = schema.safeParse({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") });
    setFailed(false);
    if (!parsed.success) {
      const f = z.flattenError(parsed.error).fieldErrors;
      setErrors({ email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setErrors({});
    setLoading(true);
    const res = await signIn("credentials", { email: parsed.data.email.toLowerCase(), password: parsed.data.password, redirect: false });
    if (!res?.ok) {
      setLoading(false);
      setFailed(true);
      return;
    }
    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">Sign in to Talvyn</h1>
        <p className="mt-1 text-base text-ink-muted">Use the email your workspace invited you with.</p>
      </div>

      {notice === "reset" && <Alert tone="success" title="Password updated">Sign in with your new password.</Alert>}
      {failed && (
        <Alert tone="danger" title="Couldn't sign you in">
          That email and password don&apos;t match an active account. New accounts can sign in once their access request is approved.
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Work email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" autoFocus required />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput name="password" autoComplete="current-password" required />
        </Field>
        <div className="-mt-1 flex justify-end">
          <Link href="/forgot-password" className="rounded-control text-sm text-ink-muted hover:text-ink">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" loading={loading} className="w-full">
          {loading ? "Signing in" : "Sign in"}
        </Button>
      </form>

      <p className="text-base text-ink-muted">
        New to Talvyn?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Request access
        </Link>
      </p>
    </div>
  );
}
