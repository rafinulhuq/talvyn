/**
 * DeleteJdDialog — confirms permanent job description deletion.
 * Warns that extracted data and tests tied to this JD are removed.
 */

"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DeleteJdDialogProps {
  jdTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function DeleteJdDialog({
  jdTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteJdDialogProps) {
  return (
    <ConfirmDialog
      title="Delete this job description?"
      description={
        <>
          <span className="font-medium text-slate-900">&ldquo;{jdTitle}&rdquo;</span>{" "}
          and all of its extracted data and tests will be permanently deleted.
          This cannot be undone.
        </>
      }
      confirmLabel="Delete JD"
      confirmingLabel="Deleting…"
      isConfirming={isDeleting}
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
