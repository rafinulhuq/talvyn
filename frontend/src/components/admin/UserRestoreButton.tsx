"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";

interface UserRestoreButtonProps {
  userId: string;
}

/** Reverses UserDeleteButton's removal (clears deletedAt). No confirmation —
 * restoring is the safe direction, same convention as "Reactivate". */
export function UserRestoreButton({ userId }: UserRestoreButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/restore`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Failed to restore account.");
        return;
      }
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
        disabled={saving}
        onClick={restore}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success-dark transition-colors hover:bg-success-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        Restore
      </button>
      {error && <p className="text-xs text-danger-dark">{error}</p>}
    </div>
  );
}
