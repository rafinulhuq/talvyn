"use client";

import { useRef, useState, type FormEvent } from "react";
import { z } from "@/lib/zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PublicRegisterResult } from "@/types/attempt";

const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name.").max(255, "That name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z.string().trim().max(50, "That number is too long."),
  linkedin_url: z.union([z.literal(""), z.string().trim().max(500).url("Enter a full link, starting with https://")]),
  resume_url: z.union([z.literal(""), z.string().trim().max(500).url("Enter a full link, starting with https://")]),
});
type Values = z.infer<typeof schema>;
type Errors = Partial<Record<keyof Values, string>>;

/**
 * Soft duplicate-device signal for the backend (never a hard block): a hash of
 * stable browser properties plus a canvas/WebGL render. Unchanged from the
 * previous frontend. Any failure just means no fingerprint is sent.
 */
async function deviceFingerprint(): Promise<string | undefined> {
  try {
    const parts = [navigator.userAgent, navigator.language, String(navigator.hardwareConcurrency ?? ""), `${screen.width}x${screen.height}x${screen.colorDepth}`, Intl.DateTimeFormat().resolvedOptions().timeZone ?? "", navigator.platform ?? ""];
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillText("Talvyn-fp", 2, 2);
        parts.push(ctx.canvas.toDataURL());
      }
    } catch {
      /* canvas blocked */
    }
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && ext) parts.push(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
    } catch {
      /* no WebGL */
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

const ERRORS: Record<string, string> = {
  LINK_DISABLED: "This assessment isn't open right now. Ask the recruiter when it reopens.",
  LINK_EXPIRED: "This assessment has closed.",
  MAX_REGISTRATIONS_REACHED: "Registration is full for this assessment.",
  NO_APPROVED_TESTS: "No assessment is set up for this role yet.",
};

export function RegisterForm({ slug }: { slug: string }) {
  const [v, setV] = useState<Values>({ full_name: "", email: "", phone: "", linkedin_url: "", resume_url: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: "danger" | "info"; title?: string; text: string } | null>(null);
  const sending = useRef(false);

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    const parsed = schema.safeParse(v);
    if (!parsed.success) {
      const f = z.flattenError(parsed.error).fieldErrors;
      return setErrors(Object.fromEntries(Object.entries(f).map(([k, m]) => [k, m?.[0]])) as Errors);
    }
    sending.current = true;
    setBusy(true);
    setOutcome(null);
    const d = parsed.data;
    const fp = await deviceFingerprint();
    try {
      const res = await fetch(`/api/public/api/v1/public-links/${encodeURIComponent(slug)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin", // carries the rp_device_id cookie
        body: JSON.stringify({
          full_name: d.full_name,
          email: d.email,
          ...(d.phone ? { phone: d.phone } : {}),
          ...(d.linkedin_url ? { linkedin_url: d.linkedin_url } : {}),
          ...(d.resume_url ? { resume_url: d.resume_url } : {}),
          ...(fp ? { device_fingerprint: fp } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as (PublicRegisterResult & { error?: { code?: string } }) | null;
      if (!res.ok) {
        const code = body?.error?.code ?? "";
        setOutcome({ tone: "danger", text: ERRORS[code] ?? (res.status === 404 ? "This link doesn't exist." : res.status === 429 ? "Too many attempts. Wait a minute and try again." : "Registration didn't go through. Try again in a moment.") });
      } else if (body?.status === "already_completed") {
        setOutcome({ tone: "info", title: "You've already finished this assessment", text: body.message });
      } else if (body?.status === "terminated") {
        setOutcome({ tone: "danger", title: "This assessment is closed to you", text: body.message });
      } else if (body?.token) {
        // A full navigation on purpose: src/proxy.ts swaps the token in the URL for an httpOnly cookie.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/tests/${encodeURIComponent(body.token)}`);
        return;
      } else {
        setOutcome({ tone: "danger", text: "Registration didn't go through. Try again in a moment." });
      }
    } catch {
      setOutcome({ tone: "danger", text: "You appear to be offline. Check your connection and try again." });
    }
    sending.current = false;
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 border-t border-line pt-5">
      {outcome && (
        <Alert tone={outcome.tone} title={outcome.title}>
          {outcome.text}
        </Alert>
      )}
      <Field label="Full name" error={errors.full_name}>
        <Input autoComplete="name" value={v.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input type="email" autoComplete="email" value={v.email} onChange={set("email")} />
      </Field>
      <Field label="Phone" optional error={errors.phone}>
        <Input type="tel" autoComplete="tel" value={v.phone} onChange={set("phone")} />
      </Field>
      <Field label="LinkedIn profile" optional error={errors.linkedin_url}>
        <Input type="url" inputMode="url" placeholder="https://" value={v.linkedin_url} onChange={set("linkedin_url")} />
      </Field>
      <Field label="Résumé link" optional error={errors.resume_url}>
        <Input type="url" inputMode="url" placeholder="https://" value={v.resume_url} onChange={set("resume_url")} />
      </Field>
      <Button type="submit" variant="primary" className="h-10 w-full" loading={busy}>
        {busy ? "Registering" : "Continue to the assessment"}
      </Button>
      <p className="text-sm text-ink-muted">Next you&apos;ll see the rules. The timer only starts when you choose to begin.</p>
    </form>
  );
}
