"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Download, LayoutGrid, Loader2, ShieldCheck, Trophy, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  LeaderboardFilters,
  type FacetOption,
  type PassFilter,
  type SortDir,
  type SortKey,
} from "@/components/admin/leaderboard/LeaderboardFilters";
import { LeaderboardStats } from "@/components/admin/leaderboard/LeaderboardStats";
import { LeaderboardTable } from "@/components/admin/leaderboard/LeaderboardTable";
import { LeaderboardPodium } from "@/components/admin/leaderboard/LeaderboardPodium";
import { CandidateDossierDrawer } from "@/components/admin/leaderboard/CandidateDossierDrawer";
import { evaluationApi } from "@/lib/api/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
} from "@/types/evaluation";
import type {
  AIRecommendation,
  EvaluationLevel,
  GlobalLeaderboardEntry,
} from "@/types/evaluation";

type RankedLeaderboardEntry = GlobalLeaderboardEntry & { displayRank: number };

// users.company_name is only ever written by the signup flow — anyone created
// by create-admin.sh (or seeded) has it NULL. Bucketing those under a real
// label keeps the superadmin cross-company view usable instead of silently
// collapsing to "0 companies" and hiding the Company filter entirely.
const UNASSIGNED_COMPANY = "No company set";

function companyKeyOf(entry: GlobalLeaderboardEntry): string {
  return entry.company_name?.trim() || UNASSIGNED_COMPANY;
}

const LEVELS: EvaluationLevel[] = ["EXPERT", "ADVANCED", "INTERMEDIATE", "BEGINNER"];
const RECS: AIRecommendation[] = ["STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"];

const effectiveRecOf = (entry: GlobalLeaderboardEntry): AIRecommendation =>
  entry.admin_override_recommendation ?? entry.ai_recommendation;

/**
 * Quote one CSV field. Every cell goes through this — a value only needs
 * quoting when it contains a comma, quote or newline, but quoting uniformly
 * is what stops a stray comma in a job title from shifting every column to
 * its right (the classic "the export looks fine until one row doesn't" bug).
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

type FilterState = {
  search: string;
  jd: string;
  company: string;
  user: string;
  levels: ReadonlySet<EvaluationLevel>;
  recs: ReadonlySet<AIRecommendation>;
  pass: PassFilter;
};

/**
 * The single source of truth for "does this row survive the filters".
 *
 * `skip` omits one facet from the test, which is what makes the counts in
 * each dropdown contextual: the number beside "Expert" is how many rows you'd
 * get if you picked Expert *given everything else already selected*, rather
 * than a fixed total that lies as soon as another filter is on. Passing
 * skip=null gives the real result set.
 */
function matchesExcept(
  entry: GlobalLeaderboardEntry,
  state: FilterState,
  isSuperAdmin: boolean,
  skip: keyof FilterState | null
): boolean {
  if (skip !== "search" && state.search) {
    const query = state.search.toLowerCase();
    const haystack = [
      entry.candidate_name,
      entry.candidate_email,
      entry.jd_title,
      entry.invited_by_name ?? "",
      entry.company_name ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (skip !== "jd" && state.jd !== "all" && entry.jd_id !== state.jd) return false;
  if (skip !== "company" && isSuperAdmin && state.company !== "all") {
    if (companyKeyOf(entry) !== state.company) return false;
  }
  if (skip !== "user" && isSuperAdmin && state.user !== "all") {
    if (entry.invited_by_id !== state.user) return false;
  }
  if (skip !== "recs" && state.recs.size > 0 && !state.recs.has(effectiveRecOf(entry))) {
    return false;
  }
  if (skip !== "levels" && state.levels.size > 0) {
    // evaluation_level is nullable — an unlevelled row matches no level
    // filter, same as the old `!== filterLevel` scalar comparison did.
    if (!entry.evaluation_level || !state.levels.has(entry.evaluation_level)) return false;
  }
  if (skip !== "pass") {
    if (state.pass === "pass" && entry.passed !== true) return false;
    if (state.pass === "fail" && entry.passed !== false) return false;
  }
  return true;
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const [entries, setEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterJd, setFilterJd] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  // Multi-select: "Expert and Advanced" is a routine ask that a scalar can't
  // express. An empty set means "no constraint", not "nothing matches".
  const [filterRec, setFilterRec] = useState<ReadonlySet<AIRecommendation>>(new Set());
  const [filterLevel, setFilterLevel] = useState<ReadonlySet<EvaluationLevel>>(new Set());
  const [filterPass, setFilterPass] = useState<PassFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedCandidate, setSelectedCandidate] = useState<GlobalLeaderboardEntry | null>(null);
  const [showPodium, setShowPodium] = useState<boolean>(true);

  useEffect(() => {
    evaluationApi.getGlobalLeaderboard().then((result) => {
      setLoading(false);
      if (result.success) setEntries(result.data.entries);
    });
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rank" ? "asc" : key === "name" ? "asc" : "desc");
    }
  }

  function handleFilterCompanyChange(value: string) {
    setFilterCompany(value);
    setFilterUser("all");
  }

  function clearFilters() {
    setSearch("");
    setFilterJd("all");
    setFilterCompany("all");
    setFilterUser("all");
    setFilterRec(new Set());
    setFilterLevel(new Set());
    setFilterPass("all");
  }

  // Set state is replaced, never mutated in place — React bails on a re-render
  // if the identity doesn't change.
  const toggleLevel = useCallback((level: EvaluationLevel) => {
    setFilterLevel((current) => {
      const next = new Set(current);
      if (!next.delete(level)) next.add(level);
      return next;
    });
  }, []);

  const toggleRec = useCallback((rec: AIRecommendation) => {
    setFilterRec((current) => {
      const next = new Set(current);
      if (!next.delete(rec)) next.add(rec);
      return next;
    });
  }, []);

  // One state object so the counting predicate and the real result set cannot
  // drift apart — every count below and the table itself run through
  // matchesExcept with the same input.
  const filterState = useMemo<FilterState>(
    () => ({
      search,
      jd: filterJd,
      company: filterCompany,
      user: filterUser,
      levels: filterLevel,
      recs: filterRec,
      pass: filterPass,
    }),
    [search, filterJd, filterCompany, filterUser, filterLevel, filterRec, filterPass]
  );

  const countFor = useCallback(
    (skip: keyof FilterState, predicate: (entry: GlobalLeaderboardEntry) => boolean) =>
      entries.filter(
        (entry) => matchesExcept(entry, filterState, isSuperAdmin, skip) && predicate(entry)
      ).length,
    [entries, filterState, isSuperAdmin]
  );

  const jdOptions = useMemo<FacetOption[]>(() => {
    const seen = new Map<string, string>();
    entries.forEach((entry) => seen.set(entry.jd_id, entry.jd_title));
    return [...seen.entries()]
      .map(([value, label]) => ({
        value,
        label,
        count: countFor("jd", (entry) => entry.jd_id === value),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entries, countFor]);

  const companyOptions = useMemo<FacetOption[]>(() => {
    if (!isSuperAdmin) return [];
    const names = [...new Set(entries.map(companyKeyOf))];
    // "No company set" always sorts last so real companies read first.
    names.sort((a, b) => {
      if (a === UNASSIGNED_COMPANY) return 1;
      if (b === UNASSIGNED_COMPANY) return -1;
      return a.localeCompare(b);
    });
    return names.map((name) => ({
      value: name,
      label: name,
      sublabel: name === UNASSIGNED_COMPANY ? "recruiter has no company on file" : undefined,
      count: countFor("company", (entry) => companyKeyOf(entry) === name),
    }));
  }, [entries, isSuperAdmin, countFor]);

  // Only companies with an actual name count towards the header — a pool made
  // up entirely of unnamed recruiters is "0 companies", not "1".
  const namedCompanyCount = useMemo(
    () => companyOptions.filter((option) => option.value !== UNASSIGNED_COMPANY).length,
    [companyOptions]
  );

  const userOptions = useMemo<FacetOption[]>(() => {
    if (!isSuperAdmin) return [];
    // Recruiter scopes to the selected company — after picking a company you
    // shouldn't still be offered recruiters who have nobody in it.
    const seen = new Map<string, FacetOption>();
    entries.forEach((entry) => {
      const id = entry.invited_by_id;
      if (!id || seen.has(id)) return;
      if (filterCompany !== "all" && companyKeyOf(entry) !== filterCompany) return;
      seen.set(id, {
        value: id,
        label: entry.invited_by_name || entry.invited_by_email || "User",
        sublabel: companyKeyOf(entry),
        count: countFor("user", (row) => row.invited_by_id === id),
      });
    });
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [entries, isSuperAdmin, filterCompany, countFor]);

  const levelOptions = useMemo<FacetOption[]>(
    () =>
      LEVELS.map((level) => ({
        value: level,
        label: EVALUATION_LEVEL_CONFIG[level]?.label ?? level,
        count: countFor("levels", (entry) => entry.evaluation_level === level),
      })),
    [countFor]
  );

  const recOptions = useMemo<FacetOption[]>(
    () =>
      RECS.map((rec) => ({
        value: rec,
        label: RECOMMENDATION_CONFIG[rec]?.label ?? rec,
        count: countFor("recs", (entry) => effectiveRecOf(entry) === rec),
      })),
    [countFor]
  );

  const outcomeCounts = useMemo<Record<PassFilter, number>>(
    () => ({
      all: countFor("pass", () => true),
      pass: countFor("pass", (entry) => entry.passed === true),
      fail: countFor("pass", (entry) => entry.passed === false),
    }),
    [countFor]
  );

  const displayed = useMemo<RankedLeaderboardEntry[]>(() => {
    // skip=null → the real result set, using the exact predicate the dropdown
    // counts run through, so a count can never disagree with the table.
    const filtered = entries.filter((entry) =>
      matchesExcept(entry, filterState, isSuperAdmin, null)
    );

    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortKey === "rank") {
        comparison = b.percentage - a.percentage;
        return sortDir === "asc" ? comparison : -comparison;
      }
      if (sortKey === "name") comparison = a.candidate_name.localeCompare(b.candidate_name);
      else if (sortKey === "date") {
        comparison = new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime();
      }
      return sortDir === "asc" ? comparison : -comparison;
    });

    return filtered.map((entry, index) => ({ ...entry, displayRank: index + 1 }));
  }, [entries, filterState, isSuperAdmin, sortKey, sortDir]);

  const topThree = useMemo(() => displayed.slice(0, 3), [displayed]);

  const handleExportCsv = useCallback(() => {
    if (displayed.length === 0) return;
    const headers = [
      "Rank",
      "Name",
      "Email",
      "Phone",
      "LinkedIn",
      "Resume",
      "Candidate Number",
      "Recruiter Name",
      "Recruiter Email",
      "Company",
      "JD",
      "Test",
      "Percentage",
      "Total Score",
      "Max Score",
      "Level",
      "Recommendation",
      "Passed",
      "Evaluated At",
    ];
    const rows = displayed.map((d) => [
      d.displayRank,
      d.candidate_name,
      d.candidate_email,
      d.candidate_phone,
      d.candidate_linkedin_url,
      d.candidate_resume_url,
      d.candidate_number,
      d.invited_by_name,
      d.invited_by_email,
      d.company_name,
      d.jd_title,
      d.test_title,
      d.percentage,
      d.total_score,
      d.max_score,
      d.evaluation_level,
      d.admin_override_recommendation ?? d.ai_recommendation,
      // `passed` is boolean | null — null means the test has no passing_marks,
      // so there is no pass/fail verdict to report. The old `d.passed ? … : …`
      // collapsed that third state into "Fail" and libelled every candidate on
      // a test without a pass mark.
      d.passed === true ? "Pass" : d.passed === false ? "Fail" : "Not scored",
      d.evaluated_at,
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    // A Blob, not a data: URI — encodeURI() leaves "#" intact, which truncates
    // a data: URL at the first one, and long exports blow the URL length cap.
    const url = URL.createObjectURL(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `talvyn-leaderboard-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [displayed]);

  return (
    <div className="w-full space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/60 shadow-xs">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                  Leaderboard
                </h1>
                {isSuperAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                    <ShieldCheck className="h-3 w-3" />
                    SUPERADMIN MULTI-COMPANY
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {isSuperAdmin
                  ? `Unified candidate pool — ${entries.length} result${entries.length === 1 ? "" : "s"} from ${userOptions.length} recruiter${userOptions.length === 1 ? "" : "s"}${
                      namedCompanyCount > 0
                        ? ` across ${namedCompanyCount} ${namedCompanyCount === 1 ? "company" : "companies"}`
                        : " (no company names on file)"
                    }`
                  : "Ranked candidate pool across all active job openings and assessments"}
              </p>
            </div>
          </div>

          {entries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPodium((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>{showPodium ? "Hide Podium" : "Show Podium"}</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={displayed.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No evaluated candidates yet"
          description={
            <>
              Run evaluations from{" "}
              <Link href="/dashboard/results" className="text-brand-700 hover:underline">
                Results
              </Link>{" "}
              to see the leaderboard.
            </>
          }
        />
      ) : (
        <>
          {showPodium && displayed.length > 0 && (
            <LeaderboardPodium
              topEntries={topThree}
              onSelectCandidate={setSelectedCandidate}
            />
          )}

          <LeaderboardStats entries={entries} />
          <LeaderboardFilters
            search={search}
            onSearchChange={setSearch}
            jdOptions={jdOptions}
            filterJd={filterJd}
            onFilterJdChange={setFilterJd}
            companyOptions={isSuperAdmin ? companyOptions : undefined}
            filterCompany={filterCompany}
            onFilterCompanyChange={handleFilterCompanyChange}
            userOptions={isSuperAdmin ? userOptions : undefined}
            filterUser={filterUser}
            onFilterUserChange={setFilterUser}
            levelOptions={levelOptions}
            filterLevel={filterLevel}
            onToggleLevel={toggleLevel}
            onClearLevel={() => setFilterLevel(new Set())}
            recOptions={recOptions}
            filterRec={filterRec}
            onToggleRec={toggleRec}
            onClearRec={() => setFilterRec(new Set())}
            filterPass={filterPass}
            onFilterPassChange={setFilterPass}
            outcomeCounts={outcomeCounts}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={toggleSort}
            onClearAll={clearFilters}
            displayedCount={displayed.length}
            totalCount={entries.length}
          />
          <LeaderboardTable
            displayed={displayed}
            onClearFilters={clearFilters}
            onSelectCandidate={setSelectedCandidate}
          />
          <p className="mt-3 text-center text-xs text-slate-400">
            Tap any row or the Dossier button to view full telemetry and performance analysis
          </p>

          <CandidateDossierDrawer
            entry={selectedCandidate}
            onClose={() => setSelectedCandidate(null)}
          />
        </>
      )}
    </div>
  );
}
