/**
 * UserStatusToggle — lets a Super Admin deactivate/reactivate another admin
 * account. Deactivation blocks future sign-in (checked in authorize()) but
 * doesn't revoke an already-issued session token — same limitation the
 * role-change flow already has, since sessions are stateless JWTs.
 * Deactivating is a confirmed action (it's reversible, but still blocks
 * someone from doing their job); reactivating isn't.
 */

"use client";

import { useState } from "react";
import { Loader2, UserX, UserCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface UserStatusToggleProps {
  userId: string;
  userName: string;
  isActive: boolean;
  /** Disables the control entirely — used for the signed-in Super Admin's
   * own row and for the last active Super Admin. */
  disabled?: boolean;
}

export function UserStatusToggle({ userId, userName, isActive, disabled }: UserStatusToggleProps) {
  const [active, setActive] = useState(isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  async function setStatus(nextActive: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Failed to update status.");
        return;
      }
      setActive(nextActive);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => (active ? setShowConfirm(true) : setStatus(true))}
        className={
          active
            ? "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-[#F87171]/10 hover:text-[#F87171] disabled:cursor-not-allowed disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#4ADE80] transition-colors hover:bg-[#4ADE80]/10 hover:text-[#4ADE80] disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : active ? (
          <UserX className="h-3.5 w-3.5" />
        ) : (
          <UserCheck className="h-3.5 w-3.5" />
        )}
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {error && <p className="text-xs text-danger-dark">{error}</p>}

      {showConfirm && (
        <ConfirmDialog
          title="Deactivate this account?"
          description={
            <>
              <span className="font-semibold text-white">{userName}</span> will
              no longer be able to sign in. You can reactivate the account at
              any time from this page.
            </>
          }
          confirmLabel="Deactivate"
          confirmingLabel="Deactivating…"
          isConfirming={saving}
          variant="danger"
          onConfirm={() => setStatus(false)}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
