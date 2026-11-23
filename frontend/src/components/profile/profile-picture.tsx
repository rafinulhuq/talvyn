"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { UserAvatar } from "@/components/users/user-avatar";

const MAX = 5 * 1024 * 1024;

export function ProfilePicture({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"up" | "rm" | null>(null);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0); // remount the avatar so the new image loads

  async function upload(f: File) {
    setError(undefined);
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setError("Choose a JPEG, PNG or WebP image.");
    if (f.size > MAX) return setError("That image is larger than 5 MB.");
    setBusy("up");
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/users/me/avatar", { method: "POST", body: form, credentials: "same-origin" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      return setError(body?.error?.message ?? "The picture didn't upload. Try again.");
    }
    setVersion((v) => v + 1);
    toast({ title: "Picture updated", tone: "success" });
    router.refresh();
  }

  async function remove() {
    setBusy("rm");
    const res = await fetch("/api/users/me/avatar", { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError("The picture wasn't removed. Try again.");
    setVersion((v) => v + 1);
    toast({ title: "Picture removed" });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <UserAvatar key={version} id={id} name={name} size={64} />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="secondary" loading={busy === "up"} onClick={() => input.current?.click()}>
            <Upload aria-hidden className="size-4" /> Upload a picture
          </Button>
          <Button variant="ghost" loading={busy === "rm"} onClick={() => void remove()}>
            <Trash2 aria-hidden className="size-4" /> Remove
          </Button>
        </div>
        <p className="text-sm text-ink-muted">JPEG, PNG or WebP, up to 5 MB. Shown to your team.</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </div>
  );
}

export function PasswordResetLink({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function send() {
    setBusy(true);
    const res = await fetch("/api/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) setSent(true);
    else toast({ title: "Email not sent", description: res?.status === 429 ? "Too many requests. Try again in 15 minutes." : "Try again in a moment.", tone: "danger" });
  }
  return sent ? (
    <p role="status" className="text-base text-ink-muted">
      Check {email} for a link to choose a new password.
    </p>
  ) : (
    <Button variant="secondary" loading={busy} onClick={() => void send()}>
      Email me a password reset link
    </Button>
  );
}
