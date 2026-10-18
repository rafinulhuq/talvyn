/**
 * Admin / Recruiter Command Center Login.
 * Pure Monochrome Black & White 3D Block Element System.
 */

"use client";

import { Suspense, useState, type ReactNode } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldAlert } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TiltBlock } from "@/components/ui/TiltBlock";
import { BrandWordmark } from "@/components/BrandLogo";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof loginSchema>, string>>;

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function safeCallbackUrl(raw: string | null): string {
  if (raw && raw.startsWith("/dashboard") && !raw.startsWith("//")) {
    return raw;
  }
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (!result?.ok) {
        setAuthError("INVALID_CREDENTIALS // Access Denied");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginShell>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 font-sans">
        <Input
          label="Operator Email"
          type="email"
          placeholder="admin@talvyn.local"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
          autoFocus
          disabled={loading}
        />

        <div>
          <Input
            label="Password"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="current-password"
            disabled={loading}
          />
          <div className="mt-2 flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors dark:text-slate-400 dark:hover:text-indigo-400"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {authError && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{authError}</span>
          </div>
        )}

        <Button
          type="submit"
          loading={loading}
          variant="primary"
          size="lg"
          className="mt-2 w-full"
        >
          Sign In
        </Button>
      </form>
    </LoginShell>
  );
}

function LoginShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-600 selection:text-white flex items-center justify-center px-4 font-sans relative overflow-hidden dark:bg-slate-950 dark:text-slate-100">
      {/* Background Architectural Grid Lines */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <main id="login-main" className="relative z-10 w-full max-w-md py-12">
        {/* Brand Header */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandWordmark variant="default" className="h-9 w-auto" />
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Recruiter Command Center
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Operator Gateway
            </h1>
          </div>
        </div>

        {/* 3D Tilt Block Container */}
        <TiltBlock tag="Operator Access" className="p-6 sm:p-8">
          {children ?? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600 dark:text-indigo-400" />
            </div>
          )}
        </TiltBlock>

        {/* Footer Meta */}
        <div className="mt-6 flex flex-col items-center gap-3 text-center text-xs text-slate-500 font-medium dark:text-slate-400">
          <p>
            Need operator access?{" "}
            <Link
              href="/signup"
              className="font-semibold text-indigo-600 hover:text-indigo-700 underline dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Request Access
            </Link>
          </p>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <span>Talvyn Platform</span>
            <span>&bull;</span>
            <span>Zero Trust Verification</span>
          </div>
        </div>
      </main>
    </div>
  );
}
