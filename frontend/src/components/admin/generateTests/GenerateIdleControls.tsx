import { ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DifficultyCustomizer, type DifficultyDist } from "@/components/admin/DifficultyCustomizer";

interface Props {
  hasExtractedData: boolean;
  hasExistingTests: boolean;
  dist: DifficultyDist;
  defaultDist: DifficultyDist;
  onDistChange: (dist: DifficultyDist) => void;
  diffOpen: boolean;
  onToggleDiff: () => void;
  onGenerate: () => void;
}

export function GenerateIdleControls({
  hasExtractedData,
  hasExistingTests,
  dist,
  defaultDist,
  onDistChange,
  diffOpen,
  onToggleDiff,
  onGenerate,
}: Props) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Button
        onClick={onGenerate}
        disabled={!hasExtractedData}
        className="h-11 w-full sm:h-9 sm:w-auto"
        leftIcon={
          hasExistingTests ? <RefreshCw className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />
        }
        variant={hasExistingTests ? "secondary" : "primary"}
      >
        {hasExistingTests ? "Regenerate All Tests" : "Generate Tests"}
      </Button>
      {!hasExtractedData && (
        <p className="text-xs text-slate-400">Run &quot;Analyze JD&quot; first to extract skills.</p>
      )}
      {hasExtractedData && (
        <DifficultyCustomizer
          value={dist}
          defaultValue={defaultDist}
          onChange={onDistChange}
          open={diffOpen}
          onToggle={onToggleDiff}
        />
      )}
    </div>
  );
}
