import { Sprout } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UnlockForm } from "@/components/highgarden/unlock-form";
import { Alert } from "@/components/ui/alert";
import { OTP_COOKIE, UNLOCK_COOKIE, highgardenConfigured, verifyUnlockCookie } from "@/server/highgarden";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Unlock Highgarden" };

export default async function HighgardenUnlockPage() {
  const user = await requireAppUser();
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");
  const jar = await cookies();
  const configured = highgardenConfigured();
  if (configured && verifyUnlockCookie(jar.get(UNLOCK_COOKIE)?.value)) redirect("/dashboard/highgarden");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 pt-[8vh]">
      <div className="flex flex-col gap-3">
        <span className="grid size-9 place-items-center rounded-panel border border-line bg-surface text-ink-muted">
          <Sprout aria-hidden className="size-4.5" />
        </span>
        <div>
          <h1 className="text-xl font-medium tracking-[-0.01em] text-ink">Unlock Highgarden</h1>
          <p className="mt-1 text-base text-ink-muted">
            Highgarden shows how people use Talvyn: visits, clicks, friction and feedback. It needs a separate passphrase and a code sent to the owner, and stays unlocked for 4 hours.
          </p>
        </div>
      </div>
      <div className="rounded-panel border border-line bg-surface p-5">
        {configured ? (
          // A pending code cookie means step 1 already passed (e.g. the page was reloaded).
          <UnlockForm initialStep={jar.has(OTP_COOKIE) ? "code" : "passphrase"} />
        ) : (
          <Alert tone="danger" title="Highgarden isn't set up on this server">
            Set <code className="font-mono text-sm">HIGHGARDEN_PASSPHRASE_HASH</code> (a bcrypt hash) and <code className="font-mono text-sm">HIGHGARDEN_COOKIE_SECRET</code>, then restart the app.
          </Alert>
        )}
      </div>
    </div>
  );
}
