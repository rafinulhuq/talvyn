"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { InviteForm } from "@/components/admin/InviteForm";
import { BulkInviteForm } from "@/components/admin/BulkInviteForm";
import type { TestSummary } from "@/types/test";

type Mode = "single" | "bulk";

interface InviteModeSwitcherProps {
  jdId: string;
  approvedTests: TestSummary[];
  jdTitle: string;
}

export function InviteModeSwitcher({ jdId, approvedTests, jdTitle }: InviteModeSwitcherProps) {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="flex flex-col gap-5">
      {/* Tab toggle */}
      <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
        <TabButton
          active={mode === "single"}
          onClick={() => setMode("single")}
          icon={<UserPlus className="h-3.5 w-3.5" />}
          label="Single invite"
        />
        <TabButton
          active={mode === "bulk"}
          onClick={() => setMode("bulk")}
          icon={<Users className="h-3.5 w-3.5" />}
          label="Bulk CSV"
        />
      </div>

      {/* Active form */}
      {mode === "single" ? (
        <InviteForm jdId={jdId} approvedTests={approvedTests} jdTitle={jdTitle} />
      ) : (
        <BulkInviteForm jdId={jdId} approvedTests={approvedTests} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
