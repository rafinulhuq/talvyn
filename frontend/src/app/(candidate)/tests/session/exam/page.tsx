import type { Metadata } from "next";
import { TestFlow } from "@/components/candidate/flows";

export const metadata: Metadata = { title: "Assessment in progress" };

export default async function TestExamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = (await searchParams).attempt;
  const attemptId = typeof a === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(a) ? a : "";
  return <TestFlow attemptId={attemptId} />;
}
