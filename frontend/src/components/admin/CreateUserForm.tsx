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
    <form onSubmit={handleSubmit} noValidate className="mb-6 flex flex-col gap-4 rounded-xl border border-white/8 bg-[#121317] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#F2D74E]" />
          <p className="text-sm font-semibold text-white">New admin account</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
          <label htmlFor="new-user-role" className="text-xs font-semibold text-white">
            Role
          </label>
          <select
            id="new-user-role"
            value={role}
            disabled={saving}
            onChange={(e) => setRole(e.target.value as "USER" | "ADMIN" | "SUPER_ADMIN")}
            className="h-9 w-full rounded-lg border border-white/10 bg-[#181A1F] px-3 text-sm text-white transition-colors duration-150 hover:border-white/20 focus:border-[#F2D74E] focus:outline-none focus:ring-1 focus:ring-[#F2D74E]"
          >
            <option value="USER" className="bg-[#181A1F] text-white">User</option>
            <option value="ADMIN" className="bg-[#181A1F] text-white">Admin</option>
            <option value="SUPER_ADMIN" className="bg-[#181A1F] text-white">Super Admin</option>
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
