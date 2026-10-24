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
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
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
