import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { ProfilePictureSection } from "@/components/admin/settings/ProfilePictureSection";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "My Profile" };

// Deliberately not role-gated in middleware.ts's ROUTE_MIN_ROLE list —
// unlike /dashboard/settings (ADMIN+), every signed-in role (USER included)
// needs somewhere to manage their own profile picture.
export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="w-full">
      <PageHeader title="My Profile" subtitle="Manage your profile picture." />
      <ProfilePictureSection userId={session.user.id} userName={session.user.name} />
    </div>
  );
}
