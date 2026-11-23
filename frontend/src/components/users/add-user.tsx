"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { ROLE_LABEL } from "@/lib/domain/users";

const EMPTY = { name: "", email: "", role: "ADMIN", password: "", confirm: "" };

/** Super Admins create accounts directly; they're approved immediately. */
export function AddUser() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (val: string) => (setV((x) => ({ ...x, [k]: val })), setErrors((x) => ({ ...x, [k]: "" })));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!v.name.trim()) err.name = "Enter a name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) err.email = "Enter a valid email address.";
    if (v.password.length < 8) err.password = "Use at least 8 characters.";
    else if (v.password !== v.confirm) err.confirm = "Passwords don't match.";
    setErrors(err);
    if (Object.values(err).some(Boolean)) return;
    setBusy(true);
    setFormError(undefined);
    const res = await api("/api/admin/users", { base: "", method: "POST", body: { name: v.name.trim(), email: v.email.trim(), role: v.role, password: v.password } });
    setBusy(false);
    if (!res.ok) {
      if (res.error.code === "EMAIL_TAKEN") return setErrors({ email: res.error.message });
      return setFormError(res.error.message);
    }
    setOpen(false);
    setV(EMPTY);
    toast({ title: `${v.name.trim()} was added`, description: "Share their password with them securely.", tone: "success" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || (setErrors({}), setFormError(undefined)))}>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="size-4" /> Add user
      </Button>
      <DialogContent title="Add a user" description="The account works straight away. No approval step.">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.name}>
              <Input value={v.name} onChange={(e) => set("name")(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Work email" error={errors.email}>
              <Input type="email" value={v.email} onChange={(e) => set("email")(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <Field label="Role" hint={v.role === "USER" ? "Sees only the roles and candidates they create." : v.role === "DEV" ? "Can read the documentation only." : v.role === "SUPER_ADMIN" ? "Full access, including users and website content." : "Sees every role and candidate. Can't manage users, website content or the trash."}>
            <Select value={v.role} onValueChange={set("role")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["USER", "ADMIN", "SUPER_ADMIN", "DEV"].map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" error={errors.password} hint={errors.password ? undefined : "At least 8 characters."}>
              <PasswordInput value={v.password} onChange={(e) => set("password")(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm password" error={errors.confirm}>
              <PasswordInput value={v.confirm} onChange={(e) => set("confirm")(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={busy}>
              Add user
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
