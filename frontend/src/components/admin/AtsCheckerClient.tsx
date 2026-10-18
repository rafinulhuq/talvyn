"use client";

import { useAtsCheckerFlow } from "@/hooks/useAtsCheckerFlow";
import { AtsCheckerHeader } from "./atsChecker/AtsCheckerHeader";
import { ResumeInputStudio } from "./atsChecker/ResumeInputStudio";
import { AtsReportPanel } from "./atsChecker/AtsReportPanel";

export function AtsCheckerClient() {
  const {
    doc,
    dispatchDoc,
    isDragOver,
    setIsDragOver,
    state,
    setState,
    jds,
    selectedJdId,
    setSelectedJdId,
    fileInputRef,
    words,
    canCheck,
    handleFile,
    runCheck,
    reset,
    loadSample,
  } = useAtsCheckerFlow();

  return (
    <div className="space-y-5">
      <AtsCheckerHeader onLoadSample={loadSample} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <ResumeInputStudio
          doc={doc}
          dispatchDoc={dispatchDoc}
          checking={state.phase === "checking"}
          extracting={state.phase === "extracting"}
          isDragOver={isDragOver}
          onDragOverChange={setIsDragOver}
          fileInputRef={fileInputRef}
          words={words}
          canCheck={canCheck}
          jds={jds}
          selectedJdId={selectedJdId}
          onSelectedJdIdChange={setSelectedJdId}
          onFile={(file) => void handleFile(file)}
          onRunCheck={() => void runCheck()}
          onReset={reset}
          onEditingIdle={() => setState({ phase: "idle" })}
        />

        <AtsReportPanel state={state} result={doc.result} />
      </div>
    </div>
  );
}
