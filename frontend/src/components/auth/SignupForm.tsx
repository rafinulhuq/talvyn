// frontend/src/components/auth/SignupForm.tsx
"use client";

import { useState } from "react";
import { z } from "zod";
import type { CountryCode } from "libphonenumber-js";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { countryOptions, toE164 } from "@/lib/phone";
import { CheckCircle2, ShieldAlert } from "lucide-react";

const signupFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(255),
  name: z.string().min(1, "Name is required").max(255),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Only letters, numbers, dots, underscores, and hyphens"),
  roleInCompany: z.string().min(1, "Role in company is required").max(255),
  companyWebsite: z
    .string()
    .max(2048, "Company website URL is too long")
    .refine((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      if (!url.hostname.includes(".")) return false;
      return true;
    }, "Enter a valid company website URL"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof signupFormSchema> | "phone", string>>;

const COUNTRY_OPTIONS = countryOptions();

export function SignupForm() {
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [roleInCompany, setRoleInCompany] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [country, setCountry] = useState<CountryCode>("US");
  const [phoneNational, setPhoneNational] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = signupFormSchema.safeParse({
      companyName,
      name,
      username,
      roleInCompany,
      companyWebsite,
      email,
      password,
    });

    const fieldErrors: FormErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        fieldErrors[field] = issue.message;
      }
    }

    let phoneE164: string | undefined;
    if (phoneNational.trim()) {
      const e164 = toE164(country, phoneNational);
      if (!e164) {
        fieldErrors.phone = "Enter a valid phone number";
      } else {
        phoneE164 = e164;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          name: name.trim(),
          username: username.trim(),
          roleInCompany: roleInCompany.trim(),
          companyWebsite: companyWebsite.trim(),
          phone: phoneE164,
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSubmitError(data?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center py-6 text-center font-sans">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <p className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
          Request Dispatched
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Your operator provisioning request is pending review. An administrator will authorize access before credentials activate.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 font-sans">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Company Name"
          placeholder="Acme Systems"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          error={errors.companyName}
          autoComplete="organization"
          autoFocus
          disabled={loading}
        />
        <Input
          label="Operator Name"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoComplete="name"
          disabled={loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Username"
          placeholder="janedoe"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
          autoComplete="username"
          disabled={loading}
        />
        <Input
          label="Role in Company"
          placeholder="VP of Engineering"
          value={roleInCompany}
          onChange={(e) => setRoleInCompany(e.target.value)}
          error={errors.roleInCompany}
          autoComplete="organization-title"
          disabled={loading}
        />
      </div>

      <Input
        label="Company Website"
        type="url"
        placeholder="https://acme.org"
        value={companyWebsite}
        onChange={(e) => setCompanyWebsite(e.target.value)}
        error={errors.companyWebsite}
        autoComplete="url"
        disabled={loading}
      />

      <div className="flex flex-col gap-1.5 font-sans">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400" htmlFor="signup-phone">
          Phone Number (Optional)
        </label>
        <div className="flex gap-2">
          <select
            aria-label="Country code"
            value={country}
            onChange={(e) => setCountry(e.target.value as CountryCode)}
            disabled={loading}
            className="h-10 rounded-lg border border-slate-200/80 bg-white px-2.5 text-xs text-slate-900 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                {option.code} ({option.callingCode})
              </option>
            ))}
          </select>
          <input
            id="signup-phone"
            type="tel"
            placeholder="2015550123"
            value={phoneNational}
            onChange={(e) => setPhoneNational(e.target.value)}
            autoComplete="tel-national"
            disabled={loading}
            className="h-10 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
          />
        </div>
        {errors.phone && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {errors.phone}
          </p>
        )}
      </div>

      <Input
        label="Work Email"
        type="email"
        placeholder="jane@acme.org"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        autoComplete="email"
        disabled={loading}
      />

      <Input
        label="Password (min 8 chars)"
        type="password"
        placeholder="••••••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        autoComplete="new-password"
        disabled={loading}
      />

      {submitError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{submitError}</span>
        </div>
      )}

      <Button
        type="submit"
        loading={loading}
        variant="primary"
        size="lg"
        className="mt-3 w-full"
      >
        Submit Application
      </Button>
    </form>
  );
}
