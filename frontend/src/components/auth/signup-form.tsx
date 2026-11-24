"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { z } from "@/lib/zod";
import type { CountryCode } from "libphonenumber-js/core";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newPasswordSchema } from "@/lib/auth/password-policy";
import { api } from "@/lib/api/client";
import { countryOptions, toE164 } from "@/lib/phone";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  email: z.email("Enter a valid email address."),
  companyName: z.string().trim().min(1, "Enter your company name."),
  companyWebsite: z.string().trim().min(1, "Enter your company website."),
  roleInCompany: z.string().trim().min(1, "Enter your role."),
  username: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters.")
    .max(32, "Use at most 32 characters.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores and hyphens."),
  phone: z.string().trim().min(1, "Enter a phone number."),
  password: newPasswordSchema,
});
type FieldName = keyof z.infer<typeof schema>;

/** Accept "acme.com" as well as "https://acme.com"; the server requires a full http(s) URL. */
const withScheme = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

export function SignupForm() {
  const regionNames = useMemo(() => new Intl.DisplayNames(["en"], { type: "region" }), []);
  const countries = useMemo(
    () => countryOptions().map((c) => ({ ...c, name: regionNames.of(c.code) ?? c.code })).sort((a, b) => a.name.localeCompare(b.name)),
    [regionNames],
  );
  // Default the phone country to the browser's region; "US" during SSR. Derived, not effect-synced.
  const browserRegion = useSyncExternalStore(
    () => () => {},
    () => new Intl.Locale(navigator.language).maximize().region ?? null,
    () => null,
  );
  const [picked, setCountry] = useState<CountryCode | null>(null);
  const country: CountryCode =
    picked ?? (browserRegion && countries.some((c) => c.code === browserRegion) ? (browserRegion as CountryCode) : "US");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [failure, setFailure] = useState<string>();
  const [submittedEmail, setSubmittedEmail] = useState<string>();
  const [loading, setLoading] = useState(false);


  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const parsed = schema.safeParse(f);
    setFailure(undefined);
    if (!parsed.success) {
      const fe = z.flattenError(parsed.error).fieldErrors;
      return setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0]])));
    }
    const phoneNumber = toE164(country, parsed.data.phone);
    if (!phoneNumber) return setErrors({ phone: "Enter a valid number for the selected country." });
    setErrors({});
    setLoading(true);
    const d = parsed.data;
    const res = await api("/api/signup", {
      base: "",
      method: "POST",
      body: {
        name: d.name,
        email: d.email.toLowerCase(),
        companyName: d.companyName,
        companyWebsite: withScheme(d.companyWebsite),
        roleInCompany: d.roleInCompany,
        username: d.username,
        password: d.password,
        phoneNumber,
      },
    });
    setLoading(false);
    if (!res.ok) {
      if (res.error.code === "EMAIL_TAKEN") return setErrors({ email: res.error.message });
      if (res.error.code === "USERNAME_TAKEN") return setErrors({ username: res.error.message });
      return setFailure(res.error.message);
    }
    setSubmittedEmail(d.email);
  }

  if (submittedEmail) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-medium tracking-[-0.01em]">Request received</h1>
          <p className="mt-1 text-base text-ink-muted">
            A workspace administrator reviews every request. We&apos;ll email {submittedEmail} when your access is approved, and you can sign
            in then.
          </p>
        </div>
        <Link href="/login" className="self-start rounded-control text-base font-medium text-accent hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">Request access</h1>
        <p className="mt-1 text-base text-ink-muted">Tell us who you are. An administrator approves new workspaces, usually within a working day.</p>
      </div>
      {failure && <Alert tone="danger" title="Couldn't send your request">{failure}</Alert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Full name" error={errors.name}>
          <Input name="name" autoComplete="name" autoFocus required />
        </Field>
        <Field label="Work email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company" error={errors.companyName}>
            <Input name="companyName" autoComplete="organization" required />
          </Field>
          <Field label="Your role" error={errors.roleInCompany}>
            <Input name="roleInCompany" autoComplete="organization-title" placeholder="Head of Talent" required />
          </Field>
        </div>
        <Field label="Company website" error={errors.companyWebsite}>
          <Input name="companyWebsite" type="url" inputMode="url" autoComplete="url" placeholder="example.com" required />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span id="phone-label" className="text-sm font-medium text-ink">
            Phone
          </span>
          <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
            <Select value={country} onValueChange={(v) => setCountry(v as CountryCode)}>
              <SelectTrigger aria-label="Country code">
                <SelectValue>{countries.find((c) => c.code === country)?.callingCode ?? ""} {country}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name} <span className="text-ink-muted">{c.callingCode}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              aria-labelledby="phone-label"
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              required
            />
          </div>
          {errors.phone && (
            <p id="phone-error" className="text-sm text-danger">
              {errors.phone}
            </p>
          )}
        </div>
        <Field label="Username" hint="Letters, numbers, dots, underscores and hyphens." error={errors.username}>
          <Input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
        </Field>
        <Field label="Password" hint="At least 8 characters." error={errors.password}>
          <PasswordInput name="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" variant="primary" loading={loading} className="w-full">
          {loading ? "Sending request" : "Request access"}
        </Button>
      </form>
      <p className="text-base text-ink-muted">
        Already approved?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
