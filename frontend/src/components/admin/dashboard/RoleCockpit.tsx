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
      <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-[#121317] p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#181A1F] border border-white/5 text-[#F2D74E]">
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
              <span className="font-display text-sm font-semibold text-white">
                {activeRole === "SUPER_ADMIN"
                  ? "Superadmin Command Center"
                  : activeRole === "ADMIN"
                  ? "Admin Talent Operations"
                  : "Evaluator & Recruiter Cockpit"}
              </span>
              <span className="rounded-full border border-[#F2D74E]/30 bg-[#F2D74E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F2D74E]">
                {activeRole}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">
              Logged in as <span className="font-semibold text-white">{userName || userEmail}</span>
            </p>
          </div>
        </div>

        {/* Live Role Perspective Switcher (Super Admin / Dev feature) */}
        {canSwitch && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="hidden items-center gap-1 text-xs font-medium text-white/80 md:inline-flex">
              <SlidersHorizontal className="h-3 w-3" /> View Mode:
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-white/8 bg-[#181A1F] p-0.5 text-xs">
              {(["SUPER_ADMIN", "ADMIN", "USER"] as UserRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActiveRole(role)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                    activeRole === role
                      ? "bg-[#F2D74E] text-[#1A1600] font-semibold shadow-xs"
                      : "text-white/80 hover:text-white"
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
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                User Governance
              </span>
              <Users className="h-4 w-4 text-white/80 group-hover:text-[#F2D74E] transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-white">
                {pendingSignupCount}
              </span>
              <span className={pendingSignupCount > 0 ? "rounded-full bg-[#FACC15]/10 border border-[#FACC15]/30 px-2 py-0.5 text-[10px] font-semibold text-[#FACC15]" : "rounded-full bg-[#4ADE80]/10 border border-[#4ADE80]/30 px-2 py-0.5 text-[10px] font-semibold text-[#4ADE80]"}>
                {pendingSignupCount > 0 ? "Action Required" : "All Verified"}
              </span>
            </div>
            <p className="mt-2 text-xs text-white/70">
              {totalUserCount} total registered users &rarr;
            </p>
          </Link>

          {/* 2. Highgarden Workers */}
          <Link
            href="/dashboard/highgarden"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                Highgarden Workers
              </span>
              <Sprout className="h-4 w-4 text-white/80 group-hover:text-[#4ADE80] transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-white">
                ARQ
              </span>
              <span className="rounded-full bg-[#4ADE80]/10 border border-[#4ADE80]/30 px-2 py-0.5 text-[10px] font-semibold text-[#4ADE80]">
                Active
              </span>
            </div>
            <p className="mt-2 text-xs text-white/70">
              Redis background job telemetry & queue control &rarr;
            </p>
          </Link>

          {/* 3. CMP Content Platform */}
          <Link
            href="/dashboard/cmp"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                Content Engine
              </span>
              <PanelsTopLeft className="h-4 w-4 text-white/80 group-hover:text-[#F2D74E] transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-white">
                CMP
              </span>
              <span className="rounded-full bg-[#F2D74E]/10 border border-[#F2D74E]/30 px-2 py-0.5 text-[10px] font-semibold text-[#F2D74E]">
                Live CMS
              </span>
            </div>
            <p className="mt-2 text-xs text-white/70">
              Public articles, release notes & marketing copy &rarr;
            </p>
          </Link>

          {/* 4. Trash & System Hard Purge */}
          <Link
            href="/dashboard/trash"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                Retention & Trash
              </span>
              <Trash2 className="h-4 w-4 text-white/80 group-hover:text-[#F87171] transition-colors" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums text-white">
                Purge
              </span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                Restore
              </span>
            </div>
            <p className="mt-2 text-xs text-white/70">
              Soft-deleted JDs, candidates, and audits &rarr;
            </p>
          </Link>
        </div>
      )}

      {activeRole === "ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/dashboard/jds/upload"
            className="group block rounded-xl bg-[#F2D74E] p-4 text-[#1A1600] font-semibold shadow-xs transition-colors hover:bg-[#F7E27A]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-85">
                AI Assessment Generator
              </span>
              <FilePlus className="h-4 w-4" />
            </div>
            <div className="mt-3 font-display text-lg font-bold">
              Upload New JD
            </div>
            <p className="mt-2 text-xs opacity-75">
              Extract taxonomy and generate MCQ + Coding tests &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/templates"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                Assessment Standards
              </span>
              <Layers className="h-4 w-4 text-white/80 group-hover:text-[#F2D74E] transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-white">
              Exam Templates
            </div>
            <p className="mt-2 text-xs text-white/70">
              Standardize MCQ count, rubrics, and time windows &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/ai-checker"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                Integrity Suite
              </span>
              <BrainCircuit className="h-4 w-4 text-white/80 group-hover:text-[#F2D74E] transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-white">
              AI Checker
            </div>
            <p className="mt-2 text-xs text-white/70">
              Local Ollama writing-style and AI probability audit &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/ats-checker"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                Candidate Screening
              </span>
              <FileSearch className="h-4 w-4 text-white/80 group-hover:text-[#F2D74E] transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-white">
              ATS Matcher
            </div>
            <p className="mt-2 text-xs text-white/70">
              Match candidate resume against target role taxonomy &rarr;
            </p>
          </Link>
        </div>
      )}

      {activeRole === "USER" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/dashboard/candidates"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                My Pipeline
              </span>
              <Users className="h-4 w-4 text-white/80 group-hover:text-[#F2D74E] transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-white">
              Candidate Directory
            </div>
            <p className="mt-2 text-xs text-white/70">
              View active invites, progress, and submitted answers &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/leaderboard"
            className="group block rounded-xl border border-white/8 bg-[#121317] p-4 shadow-xs transition-colors hover:border-white/15 hover:bg-[#181A1F]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">
                Scoring & Rank
              </span>
              <Sparkles className="h-4 w-4 text-white/80 group-hover:text-[#F2D74E] transition-colors" />
            </div>
            <div className="mt-3 font-display text-lg font-bold text-white">
              Top Performers
            </div>
            <p className="mt-2 text-xs text-white/70">
              Benchmark scores, integrity flags, and test outcomes &rarr;
            </p>
          </Link>

          <Link
            href="/dashboard/ai-checker"
            className="group block rounded-xl bg-[#F2D74E] p-4 text-[#1A1600] font-semibold shadow-xs transition-colors hover:bg-[#F7E27A]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-85">
                Evaluation Aid
              </span>
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div className="mt-3 font-display text-lg font-bold">
              AI Checker Studio
            </div>
            <p className="mt-2 text-xs opacity-75">
              Check candidate answers and documents in seconds &rarr;
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}

