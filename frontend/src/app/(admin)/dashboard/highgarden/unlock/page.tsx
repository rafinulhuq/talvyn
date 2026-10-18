import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  HIGHGARDEN_UNLOCK_COOKIE,
  highgardenConfigured,
  requireSuperAdmin,
  verifyUnlockCookie,
} from "@/lib/highgarden";
import { UnlockForm } from "./UnlockForm";

export default async function HighgardenUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  await requireSuperAdmin();
  const cookieStore = await cookies();
  if (verifyUnlockCookie(cookieStore.get(HIGHGARDEN_UNLOCK_COOKIE)?.value)) {
    redirect("/dashboard/highgarden");
  }
  const params = await searchParams;
  return <UnlockForm setupMissing={params.setup === "1" || !highgardenConfigured()} />;
}
