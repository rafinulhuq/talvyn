/**
 * UserDeleteButton — lets a Super Admin remove another account. This is a
 * soft delete (sets deletedAt); the account moves to the "Removed" section
 * on this page and can be restored at any time — see UserRestoreButton.
 * Always confirmed first, unlike reactivating/restoring, since the user
 * disappears from every normal list immediately.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserMinus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface UserDeleteButtonProps {
  userId: string;
  userName: string;
  /** Disables the control — used for the signed-in Super Admin's own row,
   * the protected Super Admin account, and the last active Super Admin. */
  disabled?: boolean;
}

export function UserDeleteButton({ userId, userName, disabled }: UserDeleteButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Failed to remove account.");
        return;
      }
      setShowConfirm(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-[#F87171]/10 hover:text-[#F87171] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
        Remove
      </button>
      {error && <p className="text-xs text-danger-dark">{error}</p>}

      {showConfirm && (
        <ConfirmDialog
          title="Remove this account?"
          description={
            <>
              <span className="font-semibold text-white">{userName}</span> will
              lose access immediately and disappear from this list. Nothing is
              deleted for good — you can restore the account from the Removed
              section below at any time.
            </>
          }
          confirmLabel="Remove"
          confirmingLabel="Removing…"
          isConfirming={saving}
          variant="danger"
          onConfirm={remove}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
