"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { candidatesApi } from "@/lib/api/candidates";

/**
 * "Move to Trash" action on the candidate profile. Soft-deletes the candidate
 * (they can be restored from Dashboard → Trash) and returns to the directory.
 */
export function DeleteCandidateButton({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      const res = await candidatesApi.remove(candidateId);
      if (res.success) {
        router.push("/dashboard/candidates");
        router.refresh();
      } else {
        setError(res.error.message || "Could not delete this candidate.");
        setOpen(false);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-danger-dark transition-colors hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Move to Trash
      </button>
      {error && <p className="mt-1 text-xs text-danger-dark">{error}</p>}
      {open && (
        <ConfirmDialog
          title="Move candidate to Trash?"
          description={
            <>
              <span className="font-medium">{candidateName}</span> will be moved to the
              Trash. Their attempt history is kept, and you can restore them from
              Dashboard → Trash.
            </>
          }
          confirmLabel="Move to Trash"
          confirmingLabel="Moving…"
          isConfirming={deleting}
          variant="danger"
          icon={<Trash2 className="h-5 w-5" />}
          onConfirm={handleConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
