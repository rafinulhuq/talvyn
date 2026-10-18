import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { SettingsClient } from "@/components/admin/SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  return (
    <SettingsClient
      userRole={session?.user?.role}
      userId={session?.user?.id}
      userName={session?.user?.name}
    />
  );
}
