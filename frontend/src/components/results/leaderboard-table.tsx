"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScoreMeter } from "@/components/ui/score-meter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { RECOMMENDATION } from "@/lib/domain/invitation";
import { testTypeLabel } from "@/lib/domain/test";
import type { GlobalEntry } from "@/types/evaluation";

const ALL = "__all__";

/** Every scored test across roles, best first. Filters are client-side: the endpoint returns everything at once. */
export function LeaderboardTable({
  entries,
  showInviter,
}: {
  entries: GlobalEntry[];
  showInviter: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [role, setRole] = useState(ALL);
  const roles = useMemo(
    () => [...new Map(entries.map((e) => [e.jd_id, e.jd_title])).entries()],
    [entries],
  );
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (role === ALL || e.jd_id === role) &&
        (!n ||
          `${e.candidate_name} ${e.candidate_email}`.toLowerCase().includes(n)),
    );
  }, [entries, q, role]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          aria-label="Search candidates"
          placeholder="Search by name or email"
          className="max-w-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {roles.length > 1 && (
          <div className="w-64">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All roles</SelectItem>
                {roles.map(([id, t]) => (
                  <SelectItem key={id} value={id}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        {rows.length === 0 ? (
          <EmptyState
            title="No one matches"
            description="Clear the search or pick another role."
          />
        ) : (
          <Table aria-label="Leaderboard">
            <THead>
              <tr>
                <TH className="w-14">Rank</TH>
                <TH>Candidate</TH>
                <TH>Role and test</TH>
                <TH className="w-56">Score</TH>
                <TH>Recommendation</TH>
                {showInviter && <TH>Invited by</TH>}
              </tr>
            </THead>
            <tbody>
              {rows.map((e) => {
                const r =
                  e.admin_override_recommendation ?? e.ai_recommendation;
                const pass =
                  e.passing_marks != null && e.max_score > 0
                    ? Math.round((e.passing_marks / e.max_score) * 100)
                    : undefined;
                return (
                  <TR
                    key={e.attempt_id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(
                        `/dashboard/results/${e.attempt_id}${e.candidate_id ? `?c=${e.candidate_id}` : ""}`,
                      )
                    }
                  >
                    <TD className="tabular-nums text-ink-muted">{e.rank}</TD>
                    <TD>
                      <span className="block font-medium text-ink">
                        {e.candidate_name}
                      </span>
                      <span className="text-sm text-ink-muted">
                        {e.candidate_email}
                      </span>
                    </TD>
                    <TD>
                      <span className="block text-ink">{e.jd_title}</span>
                      <span className="text-sm text-ink-muted">
                        {testTypeLabel(e.test_type)}
                      </span>
                    </TD>
                    <TD>
                      <ScoreMeter
                        size="sm"
                        value={e.percentage}
                        label={`${e.total_score} of ${e.max_score}`}
                        passMark={pass}
                      />
                    </TD>
                    <TD>
                      <Badge tone={RECOMMENDATION[r].tone}>
                        {RECOMMENDATION[r].label}
                      </Badge>
                      {e.flagged_answer_count > 0 && (
                        <span className="block text-sm text-warning">
                          {e.flagged_answer_count} flagged as AI-like
                        </span>
                      )}
                    </TD>
                    {showInviter && (
                      <TD className="text-ink-muted">
                        {e.invited_by_name ?? "Unknown"}
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
