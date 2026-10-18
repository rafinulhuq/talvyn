"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  RefreshCw,
  Loader2,
  Clock,
  Target,
  RotateCcw,
  Trash2,
  Eye,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { testsApi } from "@/lib/api/tests";
import type { Test } from "@/types/test";
import { TEST_TYPE_LABELS } from "@/types/test";

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode | null;
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2.5 shadow-xs">
      {icon && <span className="shrink-0 text-slate-500 dark:text-slate-400">{icon}</span>}
      <div className="min-w-0">
        <dd className="text-xs font-semibold text-slate-900 dark:text-white uppercase">{value}</dd>
        <dt className="truncate text-[10px] text-slate-500 uppercase">{label}</dt>
      </div>
    </div>
  );
}

function PassMarkStat({
  testId,
  passingMarks,
  totalMarks,
}: {
  testId: string;
  passingMarks: number | null;
  totalMarks: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(passingMarks ?? ""));
  const [current, setCurrent] = useState(passingMarks);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > totalMarks) {
      setError(`Enter a whole number between 0 and ${totalMarks}`);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await testsApi.update(testId, { passing_marks: parsed });
    setSaving(false);
    if (result.success) {
      setCurrent(parsed);
      setEditing(false);
    } else {
      setError(result.error.message);
    }
  }

  function cancel() {
    setValue(String(current ?? ""));
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="col-span-2 flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2.5 sm:col-span-1 shadow-xs">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={totalMarks}
            value={value}
            autoFocus
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            aria-label="Passing marks"
            className="h-7 w-16 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs tabular-nums focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-xs text-slate-500">/ {totalMarks}</span>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white hover:bg-indigo-700 transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p className="text-[10px] text-rose-600 font-semibold">{error}</p>
        ) : (
          <dt className="text-[10px] text-slate-500 uppercase">Pass mark</dt>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2.5 shadow-xs">
      <span className="shrink-0 text-slate-500 dark:text-slate-400">
        <Target className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dd className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
          {current === null ? (
            <span className="text-slate-400 uppercase">Not set</span>
          ) : (
            `${current} / ${totalMarks}`
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit passing marks"
            className="rounded p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </dd>
        <dt className="truncate text-[10px] text-slate-500 uppercase">
          {current === null ? "No Pass/Fail without this" : "Pass mark"}
        </dt>
      </div>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: Test["difficulty"] }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {difficulty}
    </span>
  );
}

function TestHeaderActions({
  isApproved,
  approving,
  regenerating,
  deleting,
  onApprove,
  onRegenerateClick,
  onDeleteClick,
  previewHref,
}: {
  isApproved: boolean;
  approving: boolean;
  regenerating: boolean;
  deleting: boolean;
  onApprove: () => void;
  onRegenerateClick: () => void;
  onDeleteClick: () => void;
  previewHref: string;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:items-center">
      <Button
        variant={isApproved ? "secondary" : "primary"}
        onClick={onApprove}
        loading={approving}
        className="w-full sm:w-auto"
        leftIcon={
          isApproved ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )
        }
      >
        {isApproved ? "Revoke Approval" : "Approve Test"}
      </Button>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Button
          variant="outline"
          onClick={onRegenerateClick}
          disabled={regenerating}
          className="w-full sm:w-auto"
          leftIcon={
            regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
        >
          {regenerating ? "Regenerating…" : "Regenerate"}
        </Button>

        <Link
          href={previewHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </Link>
      </div>

      <Button
        variant="danger"
        className="w-full sm:ml-auto sm:w-auto"
        onClick={onDeleteClick}
        disabled={deleting}
        leftIcon={<Trash2 className="h-4 w-4" />}
      >
        Delete Test
      </Button>
    </div>
  );
}

type TestHeaderCardProps = {
  test: Test;
  typeColor: "blue" | "purple" | "green";
  isApproved: boolean;
  mcqCount: number;
  oeCount: number;
  codeCount: number;
  totalMarks: number;
  actionError: string | null;
  approving: boolean;
  regenerating: boolean;
  deleting: boolean;
  onApprove: () => void;
  onRegenerateClick: () => void;
  onDeleteClick: () => void;
};

export function TestHeaderCard({
  test,
  typeColor,
  isApproved,
  mcqCount,
  oeCount,
  codeCount,
  totalMarks,
  actionError,
  approving,
  regenerating,
  deleting,
  onApprove,
  onRegenerateClick,
  onDeleteClick,
}: TestHeaderCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300">
            {TEST_TYPE_LABELS[test.test_type]}
          </span>
          <DifficultyBadge difficulty={test.difficulty} />
          {isApproved && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle className="h-3.5 w-3.5" />
              Approved
            </span>
          )}
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{test.title}</h1>
        {test.description && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{test.description}</p>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex sm:flex-wrap sm:gap-4">
        <Stat icon={<Clock className="h-4 w-4" />} value={`${test.duration_minutes} min`} label="Duration" />
        <Stat icon={<Target className="h-4 w-4" />} value={`${totalMarks}`} label="Total marks" />
        <PassMarkStat
          testId={test.id}
          passingMarks={test.passing_marks}
          totalMarks={totalMarks}
        />
        <Stat icon={null} value={`${mcqCount}`} label="MCQ questions" />
        <Stat icon={null} value={`${oeCount}`} label="Open-ended" />
        {codeCount > 0 && <Stat icon={null} value={`${codeCount}`} label="Code questions" />}
      </dl>

      {actionError && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300">
          [Error] {actionError}
        </div>
      )}

      <TestHeaderActions
        isApproved={isApproved}
        approving={approving}
        regenerating={regenerating}
        deleting={deleting}
        onApprove={onApprove}
        onRegenerateClick={onRegenerateClick}
        onDeleteClick={onDeleteClick}
        previewHref={`/dashboard/jds/${test.jd_id}/tests/${test.id}/preview`}
      />

      {regenerating && (
        <p className="mt-3 text-xs text-slate-400">
          Generating new questions. Estimated duration: 1-2 minutes...
        </p>
      )}
    </div>
  );
}
