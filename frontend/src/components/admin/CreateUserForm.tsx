/**
 * CreateUserForm — Super-Admin-only form for creating a new admin account.
 * Replaces the old "ask someone to run the seed script" workflow with a
 * real self-service flow, gated server-side by the same SUPER_ADMIN check
 * as the role/status endpoints.
 */

"use client";

import { useState } from "react";
import { z } from "zod";
import { UserPlus, AlertCircle, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long").trim(),
  email: z.string().min(1, "Email is required").email("Enter a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]),
});

type FormErrors = Partial<Record<keyof z.infer<typeof createUserSchema>, string>>;

interface CreateUserFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CreateUserForm({ onCreated, onCancel }: CreateUserFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN" | "SUPER_ADMIN">("USER");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = createUserSchema.safeParse({ name, email, password, role });
    if (!parsed.success) {
      const errors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as keyof FormErrors] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setSubmitError(body?.error?.message ?? "Failed to create account.");
        return;
      }
      onCreated();
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mb-6 flex flex-col gap-4 rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">New admin account</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Full name"
          placeholder="Jane Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={saving}
          autoComplete="off"
        />
        <Input
          label="Email address"
          type="email"
          placeholder="jane@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={saving}
          autoComplete="off"
        />
        <Input
          label="Temporary password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={saving}
          autoComplete="new-password"
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-user-role" className="text-sm font-medium text-slate-700">
            Role
          </label>
          <select
            id="new-user-role"
            value={role}
            disabled={saving}
            onChange={(e) => setRole(e.target.value as "USER" | "ADMIN" | "SUPER_ADMIN")}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors duration-150 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
      </div>

      {submitError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-light px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger-dark">{submitError}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} leftIcon={<UserPlus className="h-3.5 w-3.5" />}>
          {saving ? "Creating…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
