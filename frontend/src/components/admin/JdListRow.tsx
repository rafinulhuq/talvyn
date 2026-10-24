"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, ChevronRight, Trash2, Loader2 } from "lucide-react";
import { jdApi } from "@/lib/api/jd";
import { JdStatusBadge } from "@/components/admin/JdStatusBadge";
import { DeleteJdDialog } from "@/components/admin/DeleteJdDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { JobDescriptionListItem } from "@/types/jd";

function formatDate(iso: string): string {
  // Explicit locale + timeZone so the server-rendered HTML (used for the
  // initial SSR pass, since jds/page.tsx is a Server Component) matches
  // what the browser renders on hydration — without these, the server's
  // and the viewer's default timezone can disagree and React flags a
  // hydration mismatch.
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function JdListRow({ jd }: { jd: JobDescriptionListItem }) {
  const router = useRouter();
  const title = jd.job_title ?? jd.original_filename;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Set when delete comes back 409 JD_HAS_CANDIDATES — `retry` re-issues
  // the same delete with force=true if the admin confirms.
  const [forceConfirm, setForceConfirm] = useState<{
    count: number;
    retry: () => void;
  } | null>(null);

  async function handleDelete(force = false) {
    setDeleting(true);
    try {
      const result = await jdApi.delete(jd.id, force);

      if (!result.success) {
        const candidateCount = result.error.details?.candidate_count;
        if (typeof candidateCount === "number") {
          setShowDeleteDialog(false);
          setForceConfirm({ count: candidateCount, retry: () => handleDelete(true) });
          return;
        }
        setShowDeleteDialog(false);
        return;
      }
      setShowDeleteDialog(false);
      setForceConfirm(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group relative">
      <Link
        href={`/dashboard/jds/${jd.id}`}
        className="flex items-center gap-4 rounded-xl border border-white/8 bg-[#121317] p-4 pr-12 shadow-xs transition-colors duration-200 hover:border-white/15"
      >
        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#181A1F] border border-white/5 text-[#F2D74E] sm:flex">
          <FileText className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="truncate font-display text-sm font-semibold text-white group-hover:text-[#F2D74E] transition-colors">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/80">
            {jd.seniority_level && (
              <span className="rounded-full border border-[#F2D74E]/30 bg-[#F2D74E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F2D74E]">
                {jd.seniority_level}
              </span>
            )}
            <span>
              {formatDate(jd.created_at)}
            </span>
            <span>·</span>
            <span>
              {jd.file_type ?? "Generated"}
            </span>
          </div>
          <div className="mt-2 sm:hidden">
            <JdStatusBadge status={jd.parse_status} />
          </div>
        </div>

        <div className="hidden shrink-0 sm:block">
          <JdStatusBadge status={jd.parse_status} />
        </div>

        <ChevronRight className="hidden h-4 w-4 shrink-0 text-white/70 group-hover:text-[#F2D74E] group-hover:translate-x-0.5 transition-all sm:block" />
      </Link>

      <button
        type="button"
        aria-label={`Delete ${title}`}
        onClick={() => setShowDeleteDialog(true)}
        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/80 hover:bg-[#F87171]/10 hover:text-[#F87171] transition-colors sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#F87171]" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>

      {showDeleteDialog && (
        <DeleteJdDialog
          jdTitle={title}
          isDeleting={deleting}
          onCancel={() => setShowDeleteDialog(false)}
          onConfirm={() => handleDelete(false)}
        />
      )}

      {forceConfirm && (
        <ConfirmDialog
          title="Candidates already linked to this JD"
          description={
            <>
              {forceConfirm.count === 1
                ? "1 candidate has"
                : `${forceConfirm.count} candidates have`}{" "}
              already been invited against this job description. Deleting it
              anyway will also remove their invitations, tests, and exam
              attempts. This cannot be undone.
            </>
          }
          confirmLabel="Delete anyway"
          confirmingLabel="Deleting…"
          isConfirming={deleting}
          variant="danger"
          onConfirm={forceConfirm.retry}
          onCancel={() => setForceConfirm(null)}
        />
      )}
    </div>
  );
}
