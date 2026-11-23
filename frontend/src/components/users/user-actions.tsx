"use client";

import { KeyRound, Mail, MoreHorizontal, RotateCcw, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { ROLE_LABEL } from "@/lib/domain/users";

const ROLES = ["USER", "ADMIN", "SUPER_ADMIN", "DEV"] as const;

const call = (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown = {}) => api(path, { base: "", method, body });

export function RoleSelect({ id, role, disabled, reason }: { id: string; role: string; disabled: boolean; reason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(next: string) {
    setBusy(true);
    const res = await call(`/api/admin/users/${id}/role`, "PATCH", { role: next });
    setBusy(false);
    if (!res.ok) return toast({ title: "Role not changed", description: res.error.message, tone: "danger" });
    toast({ title: `Role changed to ${ROLE_LABEL[next]}`, description: "Their access changes straight away." });
    router.refresh();
  }
  return (
    <div className="w-44" title={disabled ? reason : undefined}>
      <Select value={role} disabled={disabled || busy} onValueChange={(v) => void change(v)}>
        <SelectTrigger aria-label="Role" className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ActiveSwitch({ id, name, active, disabled, reason }: { id: string; name: string; active: boolean; disabled: boolean; reason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle(next: boolean) {
    setBusy(true);
    const res = await call(`/api/admin/users/${id}/status`, "PATCH", { isActive: next });
    setBusy(false);
    if (!res.ok) return toast({ title: "Not changed", description: res.error.message, tone: "danger" });
    toast({ title: next ? `${name} can sign in again` : `${name} was deactivated`, description: next ? undefined : "They were signed out everywhere." });
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2" title={disabled ? reason : undefined}>
      <Switch checked={active} disabled={disabled || busy} onCheckedChange={(v) => void toggle(v)} aria-label={`${name} can sign in`} />
      <span className="text-sm text-ink-muted">{active ? "Active" : "Deactivated"}</span>
    </span>
  );
}

export function UserMenu({ id, name, email, canRemove, removeReason }: { id: string; name: string; email: string; canRemove: boolean; removeReason?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<"set" | "remove" | null>(null);
  const [pw, setPw] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function emailLink() {
    const res = await call(`/api/admin/users/${id}/password`, "POST", { action: "email" });
    if (!res.ok) return toast({ title: "Email not sent", description: res.error.message, tone: "danger" });
    toast({ title: "Reset link sent", description: `${email} can choose a new password from the email.` });
  }

  async function setPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await call(`/api/admin/users/${id}/password`, "POST", { action: "set", ...pw });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setOpen(null);
    setPw({ password: "", confirmPassword: "" });
    toast({ title: "Password changed", description: `${name} was signed out everywhere. Share the new password securely.`, tone: "success" });
  }

  async function remove() {
    setBusy(true);
    const res = await call(`/api/admin/users/${id}`, "DELETE");
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setOpen(null);
    toast({ title: `${name} was removed`, description: "Restore them any time from Removed accounts." });
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Actions for ${name}`}>
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => void emailLink()}>
            <Mail aria-hidden /> Email a reset link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("set")}>
            <KeyRound aria-hidden /> Set a new password
          </DropdownMenuItem>
          {canRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setOpen("remove")}>
                <UserMinus aria-hidden /> Remove account
              </DropdownMenuItem>
            </>
          )}
          {!canRemove && removeReason && <p className="px-2 py-1.5 text-sm text-ink-muted">{removeReason}</p>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open !== null} onOpenChange={(o) => !o && (setOpen(null), setError(undefined))}>
        {open === "set" ? (
          <DialogContent title={`Set a new password for ${name}`} description="They're signed out everywhere and use this password next time.">
            <form onSubmit={setPassword} noValidate className="flex flex-col gap-4">
              {error && <Alert tone="danger">{error}</Alert>}
              <Field label="New password" hint="At least 8 characters.">
                <PasswordInput autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
              </Field>
              <Field label="Confirm password">
                <PasswordInput autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
              </Field>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" variant="primary" loading={busy}>
                  Set password
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : open === "remove" ? (
          <DialogContent
            title={`Remove ${name}?`}
            description="They can't sign in. Their job descriptions and candidates stay. You can restore the account later."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Keep</Button>
                </DialogClose>
                <Button variant="danger" loading={busy} onClick={() => void remove()}>
                  Remove account
                </Button>
              </>
            }
          >
            {error && <Alert tone="danger">{error}</Alert>}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

export function RestoreButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await call(`/api/admin/users/${id}/restore`, "POST");
    setBusy(false);
    if (!res.ok) return toast({ title: "Not restored", description: res.error.message, tone: "danger" });
    toast({ title: `${name} was restored`, tone: "success" });
    router.refresh();
  }
  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => void go()}>
      <RotateCcw aria-hidden className="size-3.5" /> Restore
    </Button>
  );
}

export function RequestActions({ id, name, status }: { id: string; name: string; status: "PENDING" | "REJECTED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(next: "APPROVED" | "REJECTED") {
    setBusy(next);
    const res = await call(`/api/admin/users/${id}/signup-status`, "PATCH", { signupStatus: next });
    setBusy(null);
    if (!res.ok) return toast({ title: "Not changed", description: res.error.message, tone: "danger" });
    toast({ title: next === "APPROVED" ? `${name} was approved` : `${name}'s request was declined`, tone: next === "APPROVED" ? "success" : undefined });
    router.refresh();
  }
  return (
    <span className="flex gap-2">
      {status === "PENDING" && (
        <Button size="sm" variant="ghost" loading={busy === "REJECTED"} onClick={() => void decide("REJECTED")}>
          Decline
        </Button>
      )}
      <Button size="sm" variant="primary" loading={busy === "APPROVED"} onClick={() => void decide("APPROVED")}>
        Approve
      </Button>
    </span>
  );
}
