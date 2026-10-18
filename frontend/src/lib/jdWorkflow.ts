/**
 * Builds the JD workflow stepper steps (upload -> analyze -> generate tests
 * -> approve -> invite -> review results) from data already available on the
 * JD detail/tests pages. No dedicated backend endpoint — reuses existing
 * JD/tests/invitations reads. Shared so JD detail and JD tests pages render
 * an identical, consistent stepper.
 */

import type { JobDescription } from "@/types/jd";
import type { StepperStep, StepStatus } from "@/components/ui/Stepper";

export function buildJdSteps(
  jd: JobDescription,
  testCount: number,
  approvedCount: number,
  invitationCount: number
): StepperStep[] {
  const extracted = jd.extracted_data;
  const isFailed = jd.parse_status === "FAILED";
  const isPending =
    jd.parse_status === "PENDING" || jd.parse_status === "PROCESSING";

  const analyzeStatus: StepStatus = extracted
    ? "done"
    : isFailed
      ? "blocked"
      : isPending
        ? "upcoming"
        : "current";

  const generateStatus: StepStatus =
    testCount > 0 ? "done" : extracted ? "current" : "upcoming";

  const approveStatus: StepStatus =
    testCount > 0 && approvedCount === testCount
      ? "done"
      : testCount > 0
        ? "current"
        : "upcoming";

  const inviteStatus: StepStatus =
    invitationCount > 0 ? "done" : approvedCount > 0 ? "current" : "upcoming";

  const reviewStatus: StepStatus = invitationCount > 0 ? "current" : "upcoming";

  return [
    { id: "upload", label: "Upload", status: "done" },
    { id: "analyze", label: "Analyze", status: analyzeStatus },
    {
      id: "generate",
      label: "Generate Tests",
      status: generateStatus,
      href: extracted ? `/dashboard/jds/${jd.id}/tests` : undefined,
    },
    {
      id: "approve",
      label: "Approve",
      status: approveStatus,
      href: testCount > 0 ? `/dashboard/jds/${jd.id}/tests` : undefined,
    },
    {
      id: "invite",
      label: "Invite Candidates",
      status: inviteStatus,
      href: approvedCount > 0 ? `/dashboard/jds/${jd.id}/invite` : undefined,
    },
    {
      id: "review",
      label: "Review Results",
      status: reviewStatus,
      href: invitationCount > 0 ? `/dashboard/jds/${jd.id}/candidates` : undefined,
    },
  ];
}
