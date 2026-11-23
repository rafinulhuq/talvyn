import type { Metadata } from "next";
import { DataTools } from "@/components/settings/data-tools";
import { Health, type Readiness } from "@/components/settings/health";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Webhooks, type WebhookSub } from "@/components/settings/webhooks";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { roleAtLeast } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

type Audit = { items: { id: string; actor_name: string | null; actor_email: string | null; action: string; target_type: string; summary: string | null; created_at: string }[]; total: number; page: number; page_size: number; total_pages: number };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAppUser();
  const sa = roleAtLeast(me.role, "SUPER_ADMIN");
  const tabs = [
    { id: "health", label: "System health" },
    { id: "webhooks", label: "Webhooks" },
    ...(sa
      ? [
          { id: "data", label: "Backup and data" },
          { id: "audit", label: "Audit log" },
        ]
      : []),
  ];
  const sp = await searchParams;
  const tab = tabs.some((t) => t.id === sp.tab) ? (sp.tab as string) : "health";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="How this workspace is running and connected." className="pb-0" />
      <SettingsTabs tabs={tabs} current={tab} />
      {tab === "health" && <HealthTab />}
      {tab === "webhooks" && <WebhooksTab />}
      {tab === "data" && sa && <DataTools />}
      {tab === "audit" && sa && <AuditTab page={pageParam(sp.page)} />}
    </div>
  );
}

async function HealthTab() {
  const res = await serverGet<Readiness>("/api/v1/health/ready");
  // 503 still carries the per-check detail.
  const data = res.ok ? res.data : res.status === 503 && res.data && typeof res.data === "object" && "checks" in res.data ? (res.data as Readiness) : null;
  return <Health data={data} />;
}

async function WebhooksTab() {
  const res = await serverGet<WebhookSub[]>("/api/v1/admin/webhooks/");
  if (!res.ok) return <ErrorState message={loadErrorMessage(res.status)} />;
  return <Webhooks items={res.data} />;
}

async function AuditTab({ page }: { page: number }) {
  const res = await serverGet<Audit>(`/api/v1/admin/audit-log?page=${page}&page_size=25`);
  if (!res.ok) return <ErrorState message={loadErrorMessage(res.status)} />;
  const a = res.data;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-ink-muted">Sensitive actions taken by admins, newest first: role and score changes, data resets, restores and more.</p>
      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        {a.items.length === 0 ? (
          <p className="p-5 text-base text-ink-muted">Nothing recorded yet.</p>
        ) : (
          <Table aria-label="Audit log">
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>What</TH>
              </tr>
            </THead>
            <tbody>
              {a.items.map((i) => (
                <TR key={i.id}>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDateTime(i.created_at)}</TD>
                  <TD>
                    <span className="block text-ink">{i.actor_name ?? "System"}</span>
                    {i.actor_email && <span className="text-sm text-ink-muted">{i.actor_email}</span>}
                  </TD>
                  <TD>
                    <span className="block text-ink">{i.summary ?? i.action.replaceAll("_", " ").toLowerCase()}</span>
                    <span className="font-mono text-xs text-ink-muted">{i.action}</span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <Pagination page={a.page} pageSize={a.page_size} total={a.total} totalPages={a.total_pages} href={(p) => `/dashboard/settings?tab=audit&page=${p}`} />
    </div>
  );
}
