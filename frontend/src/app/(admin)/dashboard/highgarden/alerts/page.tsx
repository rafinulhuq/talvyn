import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";
import { AlertSettingsForm } from "./AlertSettingsForm";
import { HighgardenSectionHeader } from "../HighgardenSectionHeader";

function parseRecipients(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export default async function HighgardenAlertsPage() {
  await requireHighgardenAccess();
  const settings = await prisma.highgardenAlertSettings.findUnique({ where: { id: "default" } });
  const recipients = parseRecipients(settings?.recipientsJson);

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <HighgardenSectionHeader
          title="Alerts"
          description="Email digests and alert thresholds for superadmin analytics monitoring."
        />
        <div className="rounded-full bg-white px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <Bell className="mr-2 inline h-4 w-4 text-slate-400" />
          {settings?.lastSentAt ? `Last sent ${settings.lastSentAt.toLocaleString()}` : "No digest sent yet"}
        </div>
      </div>

      <AlertSettingsForm
        defaultRecipients={recipients.join(", ")}
        enabled={settings?.enabled ?? false}
        weeklyDigestEnabled={settings?.weeklyDigestEnabled ?? false}
        errorThreshold={settings?.errorThreshold ?? 5}
        deadClickThreshold={settings?.deadClickThreshold ?? 10}
        dropThreshold={settings?.dropThreshold ?? 25}
      />

      <div className="mt-6 rounded-2xl bg-warning-light p-4 text-sm text-warning-dark">
        Automatic weekly sending is ready at the settings level, but the running ARQ worker does not currently schedule timed jobs.
        Use manual digest now; connect a scheduler later to call the same digest action.
      </div>
    </div>
  );
}
