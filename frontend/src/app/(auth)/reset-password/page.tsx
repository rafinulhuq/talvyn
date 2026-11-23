import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/auth/reset-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

const TOKEN = /^[a-f0-9]{64}$/;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">Choose a new password</h1>
        <p className="mt-1 text-base text-ink-muted">Saving signs you out everywhere else.</p>
      </div>
      {TOKEN.test(token) ? (
        <ResetForm token={token} />
      ) : (
        <Alert tone="danger" title="This reset link isn't valid">
          It may be incomplete or already used.{" "}
          <Link href="/forgot-password" className="font-medium text-accent hover:underline">
            Request a new link
          </Link>
          .
        </Alert>
      )}
      <Link href="/login" className="self-start rounded-control text-base text-ink-muted hover:text-ink">
        Back to sign in
      </Link>
    </div>
  );
}
