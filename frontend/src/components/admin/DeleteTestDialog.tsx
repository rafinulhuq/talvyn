/**
 * DeleteTestDialog — confirms permanent test deletion.
 * Shows the test title and warns that questions + candidate results are removed.
 */

"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DeleteTestDialogProps {
  testTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function DeleteTestDialog({
  testTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteTestDialogProps) {
  return (
    <ConfirmDialog
      title="Delete this test?"
      description={
        <>
          <span className="font-medium text-slate-900">&ldquo;{testTitle}&rdquo;</span>{" "}
          and all of its questions will be permanently deleted. Any candidate
          results tied to this test will be lost. This cannot be undone.
        </>
      }
      confirmLabel="Delete test"
      confirmingLabel="Deleting…"
      isConfirming={isDeleting}
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
