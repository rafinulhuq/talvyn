import type { Metadata } from "next";
import { ExamFlow } from "@/components/candidate/flows";

export const metadata: Metadata = { title: "Assessment in progress" };

export default async function ExamSectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = (await searchParams).attempt;
  const examId = typeof a === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(a) ? a : "";
  return <ExamFlow examId={examId} />;
}
