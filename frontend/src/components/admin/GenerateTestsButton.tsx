"use client";

import { useGenerateTestsFlow } from "@/hooks/useGenerateTestsFlow";
import { GenerationErrorBanner } from "./generateTests/GenerationErrorBanner";
import { GenerationProgressBanner } from "./generateTests/GenerationProgressBanner";
import { GenerationSuccessBanner } from "./generateTests/GenerationSuccessBanner";
import { GenerateIdleControls } from "./generateTests/GenerateIdleControls";

interface Props {
  jdId: string;
  jdTitle: string;
  hasExtractedData: boolean;
  hasExistingTests: boolean;
  initialDifficultyDistribution?: {
    easy_percent: number;
    medium_percent: number;
    hard_percent: number;
  } | null;
}

export function GenerateTestsButton({
  jdId,
  jdTitle,
  hasExtractedData,
  hasExistingTests,
  initialDifficultyDistribution,
}: Props) {
  const {
    uiPhase,
    setUiPhase,
    progress,
    cancelling,
    dist,
    setDist,
    defaultDist,
    diffOpen,
    setDiffOpen,
    handleGenerate,
    handleCancel,
  } = useGenerateTestsFlow({ jdId, jdTitle, hasExtractedData, hasExistingTests, initialDifficultyDistribution });

  if (uiPhase.kind === "error") {
    return (
      <GenerationErrorBanner
        message={uiPhase.message}
        code={uiPhase.code}
        onRetry={handleGenerate}
        onDismiss={() => setUiPhase({ kind: "idle" })}
      />
    );
  }

  if (uiPhase.kind === "loading") {
    return (
      <GenerationProgressBanner
        message={uiPhase.message}
        progress={progress}
        cancelling={cancelling}
        onCancel={handleCancel}
      />
    );
  }

  if (uiPhase.kind === "success") {
    return <GenerationSuccessBanner testCount={uiPhase.testCount} />;
  }

  return (
    <GenerateIdleControls
      hasExtractedData={hasExtractedData}
      hasExistingTests={hasExistingTests}
      dist={dist}
      defaultDist={defaultDist}
      onDistChange={setDist}
      diffOpen={diffOpen}
      onToggleDiff={() => setDiffOpen((o) => !o)}
      onGenerate={handleGenerate}
    />
  );
}
