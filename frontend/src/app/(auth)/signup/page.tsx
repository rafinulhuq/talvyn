import type { Metadata } from "next";
import Link from "next/link";
import { BrandWordmark } from "@/components/BrandLogo";
import { SignupForm } from "@/components/auth/SignupForm";
import { TiltBlock } from "@/components/ui/TiltBlock";

export const metadata: Metadata = { title: "Request Access | Talvyn" };

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-600 selection:text-white flex items-center justify-center px-4 font-sans relative overflow-hidden py-16 dark:bg-slate-950 dark:text-slate-100">
      {/* Background Architectural Grid Lines */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <main className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandWordmark variant="default" className="h-9 w-auto" />
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Recruiter Provisioning
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Request Operator Access
            </h1>
          </div>
        </div>

        {/* 3D Tilt Block Container */}
        <TiltBlock tag="Access Application" className="p-6 sm:p-8">
          <SignupForm />
        </TiltBlock>

        {/* Footer Meta */}
        <p className="mt-6 text-center text-xs text-slate-500 font-medium dark:text-slate-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-indigo-600 hover:text-indigo-700 underline dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Sign In
          </Link>
        </p>
      </main>
    </div>
  );
}
