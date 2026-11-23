"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!z.email().safeParse(email).success) return setError("Enter a valid email address.");
    setError(undefined);
    setLoading(true);
    const res = await api<{ message: string }>("/api/password/forgot", { base: "", method: "POST", body: { email } });
    setLoading(false);
    if (!res.ok) return setError(res.error.message);
    setSentTo(email);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">Reset your password</h1>
        <p className="mt-1 text-base text-ink-muted">We&apos;ll email you a link to choose a new one. It expires after 30 minutes.</p>
      </div>
      {sentTo ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {sentTo}, a reset link is on its way. Didn&apos;t get it? Check spam, or try again in a few minutes.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Work email" error={error}>
            <Input name="email" type="email" autoComplete="email" autoFocus required />
          </Field>
          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {loading ? "Sending link" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/login" className="self-start rounded-control text-base text-ink-muted hover:text-ink">
        Back to sign in
      </Link>
    </div>
  );
}
