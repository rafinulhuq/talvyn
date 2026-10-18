/**
 * RegisterForm — public candidate registration for /apply/[slug]
 *
 * Submits to /api/public/v1/public-links/[slug]/register (no auth, no
 * INTERNAL_API_SECRET — see api/public/[...path]/route.ts). On success:
 *   - status="redirect"          → router.push(/tests/<token>)
 *   - status="already_completed" → show a friendly message, no redirect
 *   - status="terminated"         → show a blocked message, no redirect
 */

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowRight, AlertCircle, CheckCircle, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { PublicRegisterResponse } from "@/types/public_link";

const registerSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(255, "Name is too long").trim(),
  email: z.string().min(1, "Email is required").email("Enter a valid email address").toLowerCase(),
  phone: z.string().max(50, "Phone number is too long").optional().or(z.literal("")),
  linkedin_url: z.string().max(500, "URL is too long").optional().or(z.literal("")),
  resume_url: z.string().max(500, "URL is too long").optional().or(z.literal("")),
});

type FormErrors = Partial<Record<keyof z.infer<typeof registerSchema>, string>>;

/**
 * Lightweight device fingerprint — a soft anti-cheat signal only (see
 * backend public_link_service._check_duplicate_device), never a hard
 * block. Built entirely from native browser APIs (no fingerprinting
 * library): canvas/WebGL rendering plus stable navigator/screen/timezone
 * properties, hashed with SubtleCrypto. Best-effort — any failure (canvas
 * blocked in a privacy mode, etc.) just means a coarser fingerprint or
 * none at all; registration must never depend on this succeeding.
 */
async function computeDeviceFingerprint(): Promise<string | undefined> {
  try {
    const parts: string[] = [
      navigator.userAgent,
      navigator.language,
      String(navigator.hardwareConcurrency ?? ""),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      navigator.platform ?? "",
    ];

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillText("Talvyn-fp", 2, 2);
        parts.push(canvas.toDataURL());
      }
    } catch {
      // Canvas blocked — skip, the remaining signals still apply.
    }

    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && ext) parts.push(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
    } catch {
      // WebGL unavailable — skip.
    }

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

interface RegisterFormProps {
  slug: string;
}

type UIState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "already_completed"; message: string }
  | { phase: "terminated"; message: string }
  | { phase: "error"; message: string };

export function RegisterForm({ slug }: RegisterFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [ui, setUi] = useState<UIState>({ phase: "idle" });
  const isSubmittingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    setFieldErrors({});

    const parsed = registerSchema.safeParse({
      full_name: fullName,
      email,
      phone,
      linkedin_url: linkedinUrl,
      resume_url: resumeUrl,
    });
    if (!parsed.success) {
      const errors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    isSubmittingRef.current = true;
    setUi({ phase: "submitting" });

    try {
      const deviceFingerprint = await computeDeviceFingerprint();

      // The [...path] segment after /api/public/ is forwarded verbatim as the
      // upstream FastAPI path, so it must include "api/v1" itself (mirrors
      // /api/candidate/api/v1/attempts/start in lib/api/attempts.ts) — this
      // is not a typo'd double "/api".
      const res = await fetch(`/api/public/api/v1/public-links/${slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send/receive the rp_device_id cookie
        body: JSON.stringify({
          full_name: parsed.data.full_name,
          email: parsed.data.email,
          ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
          ...(parsed.data.linkedin_url ? { linkedin_url: parsed.data.linkedin_url } : {}),
          ...(parsed.data.resume_url ? { resume_url: parsed.data.resume_url } : {}),
          ...(deviceFingerprint ? { device_fingerprint: deviceFingerprint } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const code = body?.error?.code;
        let message = "We couldn't register you just now. Please try again in a moment.";
        if (code === "LINK_DISABLED" || code === "LINK_EXPIRED") {
          message = "This assessment link is no longer active. Please contact the recruiter.";
        } else if (code === "MAX_REGISTRATIONS_REACHED") {
          message = "This assessment link has reached its maximum number of registrations.";
        } else if (code === "NO_APPROVED_TESTS") {
          message = "No assessment is available for this role right now.";
        } else if (res.status === 404) {
          message = "This assessment link doesn't exist. Please check the URL.";
        }
        setUi({ phase: "error", message });
        return;
      }

      const data: PublicRegisterResponse = await res.json();
      if (data.status === "already_completed") {
        setUi({ phase: "already_completed", message: data.message });
        return;
      }
      if (data.status === "terminated") {
        setUi({ phase: "terminated", message: data.message });
        return;
      }
      if (data.token) {
        router.push(`/tests/${data.token}`);
        return;
      }
      setUi({ phase: "error", message: "Something went wrong. Please try again." });
    } catch {
      setUi({ phase: "error", message: "Network error. Please check your connection and try again." });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  if (ui.phase === "already_completed") {
    return (
      <div className="rounded-2xl border border-slate-300 bg-white p-8 shadow-sm ring-1 ring-slate-900/5 flex flex-col items-center gap-4 text-center text-slate-900">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 shadow-sm">
          <CheckCircle className="h-6 w-6 stroke-[2.2]" />
        </div>
        <p className="text-sm font-medium text-slate-700">{ui.message}</p>
      </div>
    );
  }

  if (ui.phase === "terminated") {
    return (
      <div className="rounded-2xl border border-slate-300 bg-white p-8 shadow-sm ring-1 ring-slate-900/5 flex flex-col items-center gap-4 text-center text-slate-900">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 border border-rose-200 text-rose-600 shadow-sm">
          <ShieldAlert className="h-6 w-6 stroke-[2.2]" />
        </div>
        <p className="text-sm font-medium text-slate-700">{ui.message}</p>
      </div>
    );
  }

  const isSubmitting = ui.phase === "submitting";

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 bg-white p-6 sm:p-8 shadow-sm ring-1 ring-slate-900/5 flex flex-col gap-4 text-slate-900">
      <Input
        label="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={fieldErrors.full_name}
        placeholder="Jane Doe"
        disabled={isSubmitting}
      />
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        placeholder="jane@example.com"
        disabled={isSubmitting}
      />
      <Input
        label="Phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={fieldErrors.phone}
        placeholder="+1 555 123 4567"
        disabled={isSubmitting}
      />
      <Input
        label="LinkedIn URL (optional)"
        value={linkedinUrl}
        onChange={(e) => setLinkedinUrl(e.target.value)}
        error={fieldErrors.linkedin_url}
        placeholder="https://linkedin.com/in/janedoe"
        disabled={isSubmitting}
      />
      <Input
        label="Resume URL (optional)"
        value={resumeUrl}
        onChange={(e) => setResumeUrl(e.target.value)}
        error={fieldErrors.resume_url}
        placeholder="https://drive.google.com/..."
        disabled={isSubmitting}
      />

      {ui.phase === "error" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-xs font-medium text-rose-800">{ui.message}</p>
        </div>
      )}

      <Button
        type="submit"
        loading={isSubmitting}
        rightIcon={!isSubmitting ? <ArrowRight className="h-4 w-4" /> : undefined}
        className="mt-2"
      >
        {isSubmitting ? "GENERATING ACCESS LINK..." : "GET MY ASSESSMENT LINK"}
      </Button>
    </form>
  );
}
