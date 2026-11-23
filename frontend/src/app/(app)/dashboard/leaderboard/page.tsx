import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import { LeaderboardTable } from "@/components/results/leaderboard-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { plural } from "@/lib/domain/test";
import { roleAtLeast } from "@/lib/roles";
import { loadErrorMessage, serverGet } from "@/server/api";
import { requireAppUser } from "@/server/session";
import type { GlobalEntry } from "@/types/evaluation";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const [user, res] = await Promise.all([requireAppUser(), serverGet<{ total_candidates: number; entries: GlobalEntry[] }>("/api/v1/evaluation/leaderboard")]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Leaderboard"
        description={res.ok && res.data.total_candidates > 0 ? `${plural(res.data.total_candidates, "scored test")} across every role, best first.` : "Scored tests across every role, best first."}
        className="pb-1"
      />
      {!res.ok ? (
        <ErrorState message={loadErrorMessage(res.status)} />
      ) : res.data.entries.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState icon={Trophy} title="No scored tests yet" description="Candidates appear here once their tests are scored." />
        </div>
      ) : (
        <LeaderboardTable entries={res.data.entries} showInviter={roleAtLeast(user.role, "SUPER_ADMIN")} />
      )}
    </div>
  );
}
