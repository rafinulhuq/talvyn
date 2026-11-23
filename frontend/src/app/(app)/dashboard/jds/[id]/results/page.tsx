import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JdSubnav } from "@/components/jd/jd-subnav";
import { ExportButton } from "@/components/results/export-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ScoreMeter } from "@/components/ui/score-meter";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { BANDS, levelLabel, pct, ratePct } from "@/lib/domain/evaluation";
import { RECOMMENDATION } from "@/lib/domain/invitation";
import { jdTitle } from "@/lib/domain/jd";
import { plural } from "@/lib/domain/test";
import { formatRelative } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { Leaderboard, SystemReport } from "@/types/evaluation";
import type { JobDescription } from "@/types/jd";

export const metadata: Metadata = { title: "Results" };

export default async function JdResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const [jdRes, lbRes, repRes] = await Promise.all([
    serverGet<JobDescription>(`/api/v1/jd/${id}`),
    serverGet<Leaderboard>(`/api/v1/evaluation/leaderboard/${id}`),
    serverGet<SystemReport>(`/api/v1/evaluation/system-report/${id}`),
  ]);
  if (!jdRes.ok) {
    if (jdRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(jdRes.status)} />;
  }
  const title = jdTitle({ job_title: jdRes.data.extracted_data?.job_title ?? null, original_filename: jdRes.data.original_filename });
  const lb = lbRes.ok ? lbRes.data : null;
  const rep = repRes.ok ? repRes.data : null;
  const empty = !lb || lb.entries.length === 0;
  const recTotal = rep ? Object.values(rep.recommendation_counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Job descriptions", href: "/dashboard/jds" }, { label: title, href: `/dashboard/jds/${id}` }, { label: "Results" }]}
        title={title}
        description={empty ? "Scored candidates for this role, ranked." : `${plural(lb.total_candidates, "scored candidate")}, ranked by score.`}
        actions={!empty && <ExportButton path={`/api/v1/evaluation/system-report/${id}/export`} filename={`report_${id.slice(0, 8)}.docx`} label="Word report" />}
        className="pb-0"
      />
      <JdSubnav jdId={id} />

      {!lbRes.ok ? (
        <ErrorState message={loadErrorMessage(lbRes.status)} />
      ) : empty ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            icon={ClipboardCheck}
            title="No scored candidates yet"
            description="Once candidates submit and their tests are scored, they're ranked here."
            action={
              <Link href={`/dashboard/results?jd=${id}`} className="text-base text-accent hover:underline">
                See submissions waiting for scoring
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
            {[
              { k: "Average score", v: pct(lb.avg_percentage) },
              { k: "Highest", v: pct(rep?.highest_percentage) },
              { k: "Lowest", v: pct(rep?.lowest_percentage) },
              { k: "Pass rate", v: ratePct(lb.pass_rate) },
            ].map((s) => (
              <div key={s.k} className="bg-surface px-5 py-4">
                <dt className="text-sm text-ink-muted">{s.k}</dt>
                <dd className="mt-1 text-xl tabular-nums text-ink">{s.v}</dd>
              </div>
            ))}
          </dl>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Panel title="Ranking" bodyClassName="p-0">
              <Table aria-label="Ranking">
                <THead>
                  <tr>
                    <TH className="w-14">Rank</TH>
                    <TH>Candidate</TH>
                    <TH className="w-56">Score</TH>
                    <TH>Recommendation</TH>
                    <TH>Scored</TH>
                  </tr>
                </THead>
                <tbody>
                  {lb.entries.map((e) => {
                    const r = e.admin_override_recommendation ?? e.ai_recommendation;
                    return (
                      <TR key={e.attempt_id}>
                        <TD className="tabular-nums text-ink-muted">{e.rank}</TD>
                        <TD>
                          <Link href={`/dashboard/results/${e.attempt_id}`} className="font-medium text-ink hover:text-accent">
                            {e.candidate_name}
                          </Link>
                          <span className="block text-sm text-ink-muted">{e.candidate_email}</span>
                        </TD>
                        <TD>
                          <ScoreMeter size="sm" value={e.percentage} label={levelLabel(e.evaluation_level) ?? "Score"} passMark={e.passing_marks != null && e.max_score > 0 ? Math.round((e.passing_marks / e.max_score) * 100) : undefined} />
                        </TD>
                        <TD>
                          <Badge tone={RECOMMENDATION[r].tone}>{RECOMMENDATION[r].label}</Badge>
                          {e.admin_override_recommendation && <span className="block text-sm text-ink-muted">Reviewer</span>}
                        </TD>
                        <TD className="text-ink-muted">{formatRelative(e.evaluated_at)}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </Panel>

            {rep && (
              <div className="flex flex-col gap-6">
                <Panel title="AI recommendations">
                  <ul className="flex flex-col gap-2.5">
                    {BANDS.map((b) => {
                      const n = rep.recommendation_counts[b.rec] ?? 0;
                      return (
                        <li key={b.rec} className="flex items-center gap-3 text-base">
                          <span className="w-24 text-ink">{b.label}</span>
                          <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                            <span className="block h-full rounded-full bg-accent" style={{ width: `${recTotal ? (n / recTotal) * 100 : 0}%` }} />
                          </span>
                          <span className="w-6 text-right tabular-nums text-ink-muted">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
                {(rep.common_strong_skills.length > 0 || rep.common_weak_skills.length > 0) && (
                  <Panel title="Across candidates">
                    {rep.common_strong_skills.length > 0 && (
                      <>
                        <h3 className="text-sm text-ink-muted">Common strengths</h3>
                        <p className="mt-1 text-base text-ink">{rep.common_strong_skills.join(", ")}</p>
                      </>
                    )}
                    {rep.common_weak_skills.length > 0 && (
                      <>
                        <h3 className="mt-4 text-sm text-ink-muted">Common gaps</h3>
                        <p className="mt-1 text-base text-ink">{rep.common_weak_skills.join(", ")}</p>
                      </>
                    )}
                  </Panel>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
