"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Users,
  Sprout,
  Trash2,
  PanelsTopLeft,
  FilePlus,
  BrainCircuit,
  FileSearch,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Clock,
  Layers,
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import type { UserRole } from "@/types";

interface RoleCockpitProps {
  initialRole: UserRole;
  userName: string;
  userEmail: string;
  pendingSignupCount: number;
  totalUserCount: number;
  unhealthyChecksCount: number;
}

export function RoleCockpit({
  initialRole,
  userName,
  userEmail,
  pendingSignupCount,
  totalUserCount,
  unhealthyChecksCount,
}: RoleCockpitProps) {
  // Allow Super Admin and Dev to preview views of other roles
  const canSwitch = initialRole === "SUPER_ADMIN" || initialRole === "DEV";
  const [activeRole, setActiveRole] = useState<UserRole>(initialRole);

  return (
    <div className="space-y-4">
      {/* Role Banner & Mode Switcher */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            {activeRole === "SUPER_ADMIN" ? (
              <ShieldAlert className="h-5 w-5" />
            ) : activeRole === "ADMIN" ? (
              <Layers className="h-5 w-5" />
            ) : (
              <Users className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeRole === "SUPER_ADMIN"
                  ? "Superadmin Command Center"
                  : activeRole === "ADMIN"
                  ? "Admin Talent Operations"
                  : "Evaluator & Recruiter Cockpit"}
              </span>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                {activeRole}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Logged in as <span className="font-semibold text-slate-700 dark:text-slate-200">{userName || userEmail}</span>
            </p>
          </div>
        </div>

        {/* Live Role Perspective Switcher (Super Admin / Dev feature) */}
        {canSwitch && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="hidden items-center gap-1 text-xs font-medium text-slate-400 md:inline-flex">
              <SlidersHorizontal className="h-3 w-3" /> View Mode:
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-800/60">
              {(["SUPER_ADMIN", "ADMIN", "USER"] as UserRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActiveRole(role)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                    activeRole === role
                      ? "bg-white text-indigo-700 font-semibold shadow-xs dark:bg-slate-900 dark:text-indigo-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {role === "SUPER_ADMIN" ? "SUPER" : role}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Role-Specific Cockpit Modules */}
      {activeRole === "SUPER_ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Pending Approvals */}
          <Link
            href="/dashboard/users"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                User Governance
              </span>
              <Users className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {pendingSignupCount}
              </span>
              <span className={pendingSignupCount > 0 ? "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"}>
                {pendingSignupCount > 0 ? "Action Required" : "All Verified"}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {totalUserCount} total registered users &rarr;
            </p>
          </Link>

          {/* 2. Highgarden Workers */}
          <Link
            href="/dashboard/highgarden"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Highgarden Workers
              </span>
              <Sprout className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                ARQ
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Active
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Redis background job telemetry & queue control &rarr;
            </p>
          </Link>

          {/* 3. CMP Content Platform */}
          <Link
            href="/dashboard/cmp"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Content Engine
              </span>
              <PanelsTopLeft className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                CMP
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Live CMS
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Public articles, release notes & marketing copy &rarr;
            </p>
          </Link>

          {/* 4. Trash & System Hard Purge */}
          <Link
            href="/dashboard/trash"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Retention & Trash
              </span>
              <Trash2 className="h-4 w-4 text-slate-400 group-hover:text-rose-600 transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                Purge
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Restore
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Soft-deleted JDs, candidates, and audits &rarr;
            </p>
          </Link>
        </div>
      )}

      {activeRole === "ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/dashboard/jds/upload"
            className="group block rounded-xl bg-indigo-600 p-4 text-white shadow-xs transition-all duration-200 hover:bg-indigo-700 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-80">
                AI Assessment Generator
              </span>
              <FilePlus className="h-4 w-4" />
            </div>
            <div className="mt-3 font-display text-lg font-bold">
              Upload New JD
            </div>
            <p className="mt-2 text-xs opacity-80">
              Extract taxonomy and generate MCQ + Coding tests &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/templates"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Assessment Standards
              </span>
              <Layers className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Exam Templates
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Standardize MCQ count, rubrics, and time windows &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/ai-checker"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Integrity Suite
              </span>
              <BrainCircuit className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              AI Checker
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Local Ollama writing-style and AI probability audit &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/ats-checker"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Candidate Screening
              </span>
              <FileSearch className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              ATS Matcher
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Match candidate resume against target role taxonomy &rarr;
            </p>
          </Link>
        </div>
      )}

      {activeRole === "USER" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/dashboard/candidates"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                My Pipeline
              </span>
              <Users className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Candidate Directory
            </div>
            <p className="mt-2 text-xs text-slate-400">
              View active invites, progress, and submitted answers &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/leaderboard"
            className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Scoring & Rank
              </span>
              <Sparkles className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Top Performers
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Benchmark scores, integrity flags, and test outcomes &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/ai-checker"
            className="group block rounded-xl bg-indigo-600 p-4 text-white shadow-xs transition-all duration-200 hover:bg-indigo-700 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-80">
                Evaluation Aid
              </span>
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div className="mt-3 font-display text-lg font-bold">
              AI Checker Studio
            </div>
            <p className="mt-2 text-xs opacity-80">
              Check candidate answers and documents in seconds &rarr;
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}

