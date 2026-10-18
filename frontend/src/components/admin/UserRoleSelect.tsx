"use client";

/**
 * UserRoleSelect — lets a Super Admin promote/demote another admin account.
 * Calls PATCH /api/admin/users/[id]/role, which re-checks the caller's role
 * and the last-Super-Admin lockout guard server-side — this client check is
 * just to disable the control while a request is in flight and surface
 * errors, not the actual authorization boundary.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface UserRoleSelectProps {
  userId: string;
  currentRole: "USER" | "ADMIN" | "SUPER_ADMIN" | "DEV";
  /** Disables the control for the signed-in Super Admin's own row — changing
   * your own role while you're the only one looking at this page is the
   * easiest way to accidentally lock yourself out of it. */
  disabled?: boolean;
}

export function UserRoleSelect({ userId, currentRole, disabled }: UserRoleSelectProps) {
  const [role, setRole] = useState(currentRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(nextRole: "USER" | "ADMIN" | "SUPER_ADMIN" | "DEV") {
    if (nextRole === role || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Failed to update role.");
        return;
      }
      setRole(nextRole);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        <select
          aria-label="User role"
          value={role}
          disabled={disabled || saving}
          onChange={(e) => handleChange(e.target.value as "USER" | "ADMIN" | "SUPER_ADMIN" | "DEV")}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="DEV">Dev</option>
        </select>
      </div>
      {error && <p className="text-xs text-danger-dark">{error}</p>}
    </div>
  );
}
