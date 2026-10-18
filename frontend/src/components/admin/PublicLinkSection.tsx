/**
 * PublicLinkSection
 *
 * Lets an admin create one shareable public assessment link per JD and
 * copy it for posting anywhere (job board, careers page, etc). Each
 * candidate who registers through it gets their own private invitation —
 * this section only manages the shared link itself, not individual
 * candidates (see the invitation table elsewhere on this page).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Check,
  CheckCircle2,
  Eye,
  Link2,
  Loader2,
  PlayCircle,
  Power,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { publicLinksApi } from "@/lib/api/publicLinks";
import type { PublicAssessmentLink, PublicLinkAnalytics } from "@/types/public_link";

interface PublicLinkSectionProps {
  jdId: string;
}

const STATUS_VARIANT: Record<PublicAssessmentLink["status"], "green" | "slate" | "yellow"> = {
  ACTIVE: "green",
  DISABLED: "slate",
  EXPIRED: "yellow",
};

// Defined before PublicLinkSection to avoid Turbopack forward-reference issues.
function FunnelStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span className="text-sm font-semibold text-slate-900">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  );
}

function usePublicLink(jdId: string) {
  const [link, setLink] = useState<PublicAssessmentLink | null>(null);
  const [analytics, setAnalytics] = useState<PublicLinkAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards every setState below that follows an `await` — without it, a
  // response that resolves after the admin has navigated away (unmount) or
  // after jdId changed mid-request would still land, showing state for the
  // wrong job.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const result = await publicLinksApi.listForJd(jdId);
      if (!mountedRef.current || !result.success) return;

      // Prefer an ACTIVE link; otherwise show the most recently created one.
      const items = result.data.items;
      const active = items.find((l) => l.status === "ACTIVE");
      const current = active ?? items[0] ?? null;
      setLink(current);
      setAnalytics(null);

      if (current) {
        const analyticsResult = await publicLinksApi.getAnalytics(current.id);
        if (mountedRef.current && analyticsResult.success) setAnalytics(analyticsResult.data);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId]);

  async function handleCreate() {
    setActionLoading(true);
    setError(null);
    try {
      const result = await publicLinksApi.createOrGet(jdId);
      if (result.success) {
        await load(false);
      } else {
        const code = result.error.code;
        setError(
          code === "NO_APPROVED_TESTS"
            ? "Approve at least one test for this JD before creating a public link."
            : (result.error.message ?? "Failed to create public link.")
        );
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleStatus() {
    if (!link) return;
    setActionLoading(true);
    setError(null);
    try {
      const nextStatus = link.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      const result = await publicLinksApi.update(link.id, { status: nextStatus });
      if (result.success) {
        await load(false);
      } else {
        setError(result.error.message ?? "Failed to update link.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.public_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return { link, analytics, loading, actionLoading, copied, error, handleCreate, handleToggleStatus, handleCopy };
}

function PublicLinkDetails({
  link,
  analytics,
  copied,
  actionLoading,
  onCopy,
  onToggleStatus,
}: {
  link: PublicAssessmentLink;
  analytics: PublicLinkAnalytics | null;
  copied: boolean;
  actionLoading: boolean;
  onCopy: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
        <span className="flex-1 truncate font-mono text-[11px] text-slate-600 select-all">
          {link.public_url}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:hover:bg-slate-800"
          aria-label={copied ? "Public assessment link copied" : "Copy public assessment link"}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {link.registration_count}
          {link.max_registrations ? ` / ${link.max_registrations}` : ""} registered
        </span>
        {link.expires_at && <span>Expires {new Date(link.expires_at).toLocaleDateString()}</span>}
      </div>

      {analytics && (
        <div className="grid grid-cols-4 gap-2 rounded-lg bg-white p-3 dark:bg-slate-900">
          <FunnelStat icon={Eye} label="Views" value={analytics.views} />
          <FunnelStat icon={Users} label="Registered" value={analytics.registrations} />
          <FunnelStat icon={PlayCircle} label="Started" value={analytics.starts} />
          <FunnelStat icon={CheckCircle2} label="Completed" value={analytics.completions} />
        </div>
      )}

      {analytics && analytics.evaluated_attempts > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold text-slate-700">{Math.round((analytics.pass_rate ?? 0) * 100)}%</span>{" "}
            pass rate (STRONG_HIRE/HIRE) across {analytics.evaluated_attempts} evaluated
            attempt{analytics.evaluated_attempts !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={link.status === "ACTIVE" ? "outline" : "primary"}
          leftIcon={<Power className="h-3.5 w-3.5" />}
          loading={actionLoading}
          onClick={onToggleStatus}
          disabled={link.status === "EXPIRED"}
        >
          {link.status === "ACTIVE" ? "Disable" : "Reactivate"}
        </Button>
      </div>
    </div>
  );
}

export function PublicLinkSection({ jdId }: PublicLinkSectionProps) {
  const { link, analytics, loading, actionLoading, copied, error, handleCreate, handleToggleStatus, handleCopy } =
    usePublicLink(jdId);

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-brand-700" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Public assessment link</h2>
        </div>
        {!loading && link && (
          <Badge variant={STATUS_VARIANT[link.status]} dot>
            {link.status}
          </Badge>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Share one link with any number of candidates. Each person who registers
        gets their own private assessment link — results are tracked per candidate,
        just like a manual invite.
      </p>

      {error && (
        <p className="text-xs text-danger-dark rounded-lg border border-danger/20 bg-danger-light px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-brand-400" />
        </div>
      ) : link ? (
        <PublicLinkDetails
          link={link}
          analytics={analytics}
          copied={copied}
          actionLoading={actionLoading}
          onCopy={handleCopy}
          onToggleStatus={handleToggleStatus}
        />
      ) : (
        <Button
          size="sm"
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          loading={actionLoading}
          onClick={handleCreate}
        >
          Create public link
        </Button>
      )}
    </div>
  );
}
