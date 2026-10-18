"use client";

import { useAiCheckerFlow } from "@/hooks/useAiCheckerFlow";
import { AiCheckerHeader } from "./aiChecker/AiCheckerHeader";
import { InputStudio } from "./aiChecker/InputStudio";
import { DiagnosticPanel } from "./aiChecker/DiagnosticPanel";

export function AiCheckerClient() {
  const {
    doc,
    dispatchDoc,
    state,
    setState,
    isDragOver,
    setIsDragOver,
    fileInputRef,
    words,
    canCheck,
    handleFile,
    runCheck,
    reset,
    loadSample,
  } = useAiCheckerFlow();

  return (
    <div className="space-y-5">
      <AiCheckerHeader onLoadSample={loadSample} />

      {/* Main Workspace Layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <InputStudio
          doc={doc}
          dispatchDoc={dispatchDoc}
          checking={state.phase === "checking"}
          extracting={state.phase === "extracting"}
          isDragOver={isDragOver}
          onDragOverChange={setIsDragOver}
          fileInputRef={fileInputRef}
          words={words}
          canCheck={canCheck}
          onFile={(file) => void handleFile(file)}
          onRunCheck={() => void runCheck()}
          onReset={reset}
          onEditingIdle={() => setState({ phase: "idle" })}
        />

        <DiagnosticPanel
          state={state}
          result={doc.result}
          selectedPhrase={doc.selectedPhrase}
          onSelectPhrase={(phrase) => dispatchDoc({ type: "selectPhrase", phrase })}
        />
      </div>
    </div>
  );
}
