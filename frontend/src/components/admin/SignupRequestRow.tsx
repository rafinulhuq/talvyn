"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface SignupRequestRowProps {
  userId: string;
  companyName: string | null;
  name: string;
  email: string;
  username: string | null;
  roleInCompany: string | null;
  companyWebsite: string | null;
  phoneNumber: string | null;
  signupStatus: "PENDING" | "REJECTED";
  requestedAt: string;
}

export function SignupRequestRow({
  userId,
  companyName,
  name,
  email,
  username,
  roleInCompany,
  companyWebsite,
  phoneNumber,
  signupStatus,
  requestedAt,
}: SignupRequestRowProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(nextStatus: "APPROVED" | "REJECTED") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/signup-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signupStatus: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Failed to update request.");
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
    <div className="flex items-center gap-4 rounded-xl bg-white px-4 py-3 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
            {companyName ?? "(no company name)"}
          </p>
          <Badge variant={signupStatus === "REJECTED" ? "red" : "yellow"}>
            {signupStatus === "REJECTED" ? "Rejected" : "Pending"}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {name} — {email}
          {username && ` · @${username}`}
        </p>
        {[roleInCompany, phoneNumber].filter(Boolean).length > 0 && (
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {[roleInCompany, phoneNumber].filter(Boolean).join(" · ")}
          </p>
        )}
        {companyWebsite && (
          /^https?:\/\//i.test(companyWebsite) ? (
            <a
              href={companyWebsite}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-0.5 block truncate text-xs text-brand-700 hover:underline"
            >
              {companyWebsite}
            </a>
          ) : (
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{companyWebsite}</p>
          )
        )}
        <p className="mt-0.5 text-xs text-slate-400">Requested {requestedAt}</p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={saving}
          leftIcon={<X className="h-3.5 w-3.5" />}
          onClick={() => setStatus("REJECTED")}
        >
          Reject
        </Button>
        <Button
          size="sm"
          disabled={saving}
          leftIcon={<Check className="h-3.5 w-3.5" />}
          onClick={() => setStatus("APPROVED")}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
