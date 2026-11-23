import type { Metadata } from "next";
import { PasswordResetLink, ProfilePicture } from "@/components/profile/profile-picture";
import { ROLE_LABEL } from "@/lib/domain/users";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";
import { prisma } from "@/server/prisma";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const me = await requireAppUser();
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { id: true, name: true, email: true, role: true, companyName: true, createdAt: true } });
  if (!u) return null;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Profile" description="Your account in this workspace." className="pb-0" />
      <Panel title="Picture">
        <ProfilePicture id={u.id} name={u.name} />
      </Panel>
      <Panel title="Account" description="Ask a Super Admin to change your name, email or role.">
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Name", u.name],
            ["Email", u.email],
            ["Role", ROLE_LABEL[u.role] ?? u.role],
            ["Company", u.companyName ?? "Not set"],
            ["Member since", formatDate(u.createdAt.toISOString())],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-ink-muted">{k}</dt>
              <dd className="text-base text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Password" description="We email you a link; the link works once and expires.">
        <PasswordResetLink email={u.email} />
      </Panel>
    </div>
  );
}
