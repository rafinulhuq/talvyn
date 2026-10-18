/**
 * UserPasswordResetButton — action button rendered in user rows for Super Admins.
 * Opens the UserPasswordResetModal.
 */

"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { UserPasswordResetModal } from "./UserPasswordResetModal";

interface UserPasswordResetButtonProps {
  userId: string;
  userName: string;
  userEmail: string;
}

export function UserPasswordResetButton({
  userId,
  userName,
  userEmail,
}: UserPasswordResetButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Reset password
      </button>

      {open && (
        <UserPasswordResetModal
          userId={userId}
          userName={userName}
          userEmail={userEmail}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
