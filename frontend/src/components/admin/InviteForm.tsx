/**
 * InviteForm
 *
 * Form for sending a test invitation to a candidate.
 * - Name + email fields (validated with Zod)
 * - Dropdown to select which approved test to include
 *   (or "All approved tests" as the default)
 * - Shows send status and handles all error states
 * - On success: shows confirmation with expires_at and email delivery status
 */

"use client";

import { useReducer, useState } from "react";
import { z } from "zod";
import { Mail, Send, CheckCircle, AlertCircle, Clock, X, Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { invitationsApi } from "@/lib/api/invitations";
import type { TestSummary } from "@/types/test";
import type { CreateInvitationResponse } from "@/types/invitation";

// ── Validation schema ─────────────────────────────────────────

const inviteSchema = z.object({
  candidate_name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name is too long")
    .trim(),
  candidate_email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .toLowerCase(),
});

type FormErrors = Partial<Record<keyof z.infer<typeof inviteSchema>, string>>;

// ── Component ─────────────────────────────────────────────────

interface InviteFormProps {
  jdId: string;
  approvedTests: TestSummary[];
  jdTitle: string;
}

type UIState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "success"; result: CreateInvitationResponse }
  | { phase: "error"; message: string };

// The three candidate fields are read together on submit and reset together
// on success — grouping them keeps that reset from drifting into a partial
// clear if a future field is added and someone forgets to wire it in.
const EMPTY_FIELDS = { name: "", email: "", selectedTestId: "__all__" };

type Fields = typeof EMPTY_FIELDS;
type FieldsAction =
  | { type: "setField"; field: keyof Fields; value: string }
  | { type: "reset" };

function fieldsReducer(state: Fields, action: FieldsAction): Fields {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value };
    case "reset":
      return EMPTY_FIELDS;
  }
}

export function InviteForm({ jdId, approvedTests }: InviteFormProps) {
  const [fields, dispatchFields] = useReducer(fieldsReducer, EMPTY_FIELDS);
  const { name, email, selectedTestId } = fields;
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [ui, setUi] = useState<UIState>({ phase: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    // Client-side validation
    const parsed = inviteSchema.safeParse({ candidate_name: name, candidate_email: email });
    if (!parsed.success) {
      const errors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setUi({ phase: "sending" });

    const payload = {
      candidate_name: parsed.data.candidate_name,
      candidate_email: parsed.data.candidate_email,
      jd_id: jdId,
      ...(selectedTestId !== "__all__" ? { test_id: selectedTestId } : {}),
    };

    const result = await invitationsApi.create(payload);

    if (!result.success) {
      const status = result.statusCode;
      let message = result.error.message ?? "Failed to send invitation.";

      if (status === 409) {
        const code = result.error.code;
        if (code === "DUPLICATE_INVITATION") {
          message =
            "An active invitation already exists for this candidate. Revoke the existing invitation first.";
        } else {
          message =
            "No approved tests available for this JD. Approve at least one test before inviting candidates.";
        }
      }
      setUi({ phase: "error", message });
      return;
    }

    setUi({ phase: "success", result: result.data });
    dispatchFields({ type: "reset" });
  }

  function reset() {
    setUi({ phase: "idle" });
    setFieldErrors({});
  }

  const isLoading = ui.phase === "sending";

  // ── Success state ─────────────────────────────────────────────
  if (ui.phase === "success") {
    const { result } = ui;
    const expiresAt = new Date(result.expires_at).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    return (
      <div className="flex flex-col gap-5 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Invitation Created for {result.candidate_email}
            </p>
            {result.email_sent ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                The magic link email has been delivered successfully.
              </p>
            ) : (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                Invitation created but email delivery failed. Copy the magic
                link below and share it with the candidate directly.
              </p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800">
          <DetailRow label="Candidate" value={result.candidate_email} />
          <DetailRow
            label="Link expires"
            value={expiresAt}
            icon={<Clock className="h-3.5 w-3.5 text-slate-400" />}
          />
          <DetailRow
            label="Email delivery"
            value={result.email_sent ? "Delivered" : "Failed — copy link below"}
            valueClass={result.email_sent ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}
          />
        </div>

        {/* Magic link box — shown only when email delivery failed */}
        {!result.email_sent && result.magic_link && (
          <MagicLinkBox link={result.magic_link} />
        )}

        <Button variant="secondary" size="sm" onClick={reset}>
          Send another invitation
        </Button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Candidate fields */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Candidate Details</p>
        </div>

        <Input
          label="Full name"
          placeholder="Jane Smith"
          value={name}
          onChange={(e) => dispatchFields({ type: "setField", field: "name", value: e.target.value })}
          error={fieldErrors.candidate_name}
          disabled={isLoading}
          autoComplete="off"
        />

        <Input
          label="Email address"
          type="email"
          placeholder="jane@company.com"
          value={email}
          onChange={(e) => dispatchFields({ type: "setField", field: "email", value: e.target.value })}
          error={fieldErrors.candidate_email}
          disabled={isLoading}
          autoComplete="off"
        />
      </div>

      {/* Test selector */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Select Test</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choose which approved tests to include in the invitation.
          </p>
        </div>

        {approvedTests.length === 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs font-medium">
              No approved tests for this JD. Approve at least one test before inviting candidates.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* "All tests" option */}
            <TestOption
              label="All approved tests"
              description={`Send all ${approvedTests.length} approved tests`}
              selected={selectedTestId === "__all__"}
              onSelect={() => dispatchFields({ type: "setField", field: "selectedTestId", value: "__all__" })}
              disabled={isLoading}
            />
            {/* Individual tests */}
            {approvedTests.map((test) => (
              <TestOption
                key={test.id}
                label={test.title}
                description={`${test.duration_minutes} min · ${test.question_count} questions`}
                selected={selectedTestId === test.id}
                onSelect={() => dispatchFields({ type: "setField", field: "selectedTestId", value: test.id })}
                disabled={isLoading}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {ui.phase === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="flex-1 text-xs font-medium">{ui.message}</p>
          <button
            type="button"
            onClick={reset}
            aria-label="Dismiss error"
            className="text-rose-600 hover:opacity-75 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        loading={isLoading}
        disabled={approvedTests.length === 0}
        leftIcon={<Send className="h-4 w-4" />}
        size="lg"
        className="w-full"
      >
        {isLoading ? "Sending invitation…" : "Send Invitation"}
      </Button>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        A one-time magic link valid for 72 hours will be emailed to the candidate.
      </p>
    </form>
  );
}

// ── Sub-components ────────────────────────────────────────────

function TestOption({
  label,
  description,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all w-full ${
        selected
          ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-xs dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-200"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {/* Radio indicator */}
      <div
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400"
            : "border-slate-300 dark:border-slate-600 bg-transparent"
        }`}
      >
        {selected && <div className="h-1.5 w-1.5 rounded-full bg-white dark:bg-slate-950" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">
          {label}
        </p>
        <p className={`mt-0.5 text-xs ${selected ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}`}>
          {description}
        </p>
      </div>
    </button>
  );
}

function DetailRow({
  label,
  value,
  icon,
  valueClass = "text-slate-900 dark:text-slate-100",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className={`flex items-center gap-1.5 font-semibold ${valueClass}`}>
        {icon}
        {value}
      </span>
    </div>
  );
}

function MagicLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 flex flex-col gap-2 dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <p className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
        Magic Link (Share Directly With Candidate)
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2">
        <span className="flex-1 truncate font-mono text-xs text-slate-800 dark:text-slate-200 select-all">
          {link}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
          aria-label={copied ? "Magic link copied" : "Copy magic link"}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        One-time use link. Expires 72h after generation.
      </p>
    </div>
  );
}
