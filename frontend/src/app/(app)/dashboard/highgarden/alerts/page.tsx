import type { Metadata } from "next";
import { AlertSettingsForm } from "@/components/highgarden/alert-settings-form";
import { HighgardenChrome } from "@/components/highgarden/hg-chrome";
import { requireHighgardenPage } from "@/server/highgarden";
import { readAlertSettings } from "@/server/highgarden-data";

export const metadata: Metadata = { title: "Alerts · Highgarden" };

export default async function HighgardenAlertsPage() {
  await requireHighgardenPage();
  const settings = await readAlertSettings();
  return (
    <div className="flex flex-col gap-4">
      <HighgardenChrome section="alerts" title="Alerts" description="Who gets Highgarden email, and the digest of the last 7 days." />
      <div className="max-w-3xl">
        <AlertSettingsForm initial={settings} />
      </div>
    </div>
  );
}
