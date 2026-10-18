"use client";

import { useState } from "react";
import { Bell, Server, Shield } from "lucide-react";

import { WebhooksSection } from "@/components/admin/WebhooksSection";
import { AIEvaluationSection } from "@/components/admin/settings/AIEvaluationSection";
import { AuditLogSection } from "@/components/admin/settings/AuditLogSection";
import { BackupRestoreSection } from "@/components/admin/settings/BackupRestoreSection";
import { ProfilePictureSection } from "@/components/admin/settings/ProfilePictureSection";
import { ResetDataSection } from "@/components/admin/settings/ResetDataSection";
import { Section, SettingRow } from "@/components/admin/settings/SettingsPrimitives";
import { SystemHealthSection } from "@/components/admin/settings/SystemHealthSection";
import { PageHeader } from "@/components/ui/PageHeader";

type SettingsTab = "profile" | "overview" | "integrations" | "maintenance" | "audit";

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  description: string;
}> = [
  {
    id: "profile",
    label: "My Profile",
    description: "Your profile picture",
  },
  {
    id: "overview",
    label: "Overview",
    description: "Health, backend, security, and AI configuration",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Email and outbound webhook configuration",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Backup, restore, and reset tools",
  },
  {
    id: "audit",
    label: "Audit Log",
    description: "Sensitive admin action history",
  },
];

function SettingsOverview() {
  return (
    <>
      <SystemHealthSection />

      <Section icon={Server} title="Backend">
        <SettingRow
          label="API Proxy"
          value="/backend"
          description="Next.js rewrites /backend/* to the FastAPI service"
        />
        <SettingRow
          label="File Upload Limit"
          value="10 MB"
          description="Maximum size for PDF and DOCX uploads"
        />
        <SettingRow
          label="Accepted Formats"
          value=".pdf, .docx"
          description="Supported job description file types"
        />
      </Section>

      <Section icon={Shield} title="Security">
        <SettingRow
          label="Authentication"
          value="NextAuth"
          description="Session-based admin authentication"
        />
        <SettingRow
          label="Internal Token"
          value="Configured"
          description="Shared secret between Next.js and FastAPI"
        />
        <SettingRow
          label="Invitation Expiry"
          value="72 hours"
          description="Default lifetime for candidate magic links"
        />
      </Section>

      <AIEvaluationSection />
    </>
  );
}

function SettingsIntegrations() {
  return (
    <>
      <Section icon={Bell} title="Notifications">
        <SettingRow
          label="Email Provider"
          value="Resend / SMTP"
          description="Transactional email service for candidate invitations"
        />
      </Section>
      <WebhooksSection />
    </>
  );
}

export function SettingsClient({
  userRole,
  userId,
  userName,
}: {
  userRole?: string;
  userId?: string;
  userName?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("overview");

  // Maintenance (backup/restore/reset) and audit history are SUPER_ADMIN-only.
  // The backend enforces this with 401/403 regardless — hiding the tabs keeps
  // the UI honest about what a plain admin can do.
  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const visibleTabs = SETTINGS_TABS.filter(
    (tab) => isSuperAdmin || (tab.id !== "maintenance" && tab.id !== "audit")
  );

  return (
    <div className="w-full">
      <PageHeader
        title="Settings"
        subtitle="System configuration, environment information, and admin maintenance."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visibleTabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl border p-3.5 text-left transition-all shadow-xs ${
                selected
                  ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-200"
                  : "border-slate-200/80 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <span className="block text-xs font-bold uppercase tracking-wider">{tab.label}</span>
              <span className={`mt-1 block text-xs leading-tight ${
                selected ? "text-indigo-700/80 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"
              }`}>
                {tab.description}
              </span>
            </button>
          );
        })}
      </div>

      <div key={activeTab} className="flex flex-col gap-4 animate-fade-in motion-reduce:animate-none">
        {activeTab === "profile" && userId && (
          <ProfilePictureSection userId={userId} userName={userName} />
        )}
        {activeTab === "overview" && <SettingsOverview />}
        {activeTab === "integrations" && <SettingsIntegrations />}
        {activeTab === "maintenance" && isSuperAdmin && (
          <>
            <BackupRestoreSection />
            <ResetDataSection />
          </>
        )}
        {activeTab === "audit" && isSuperAdmin && <AuditLogSection />}
      </div>
    </div>
  );
}
