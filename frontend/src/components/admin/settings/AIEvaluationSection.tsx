"use client";

import { BrainCircuit } from "lucide-react";
import { Section, SettingRow } from "@/components/admin/settings/SettingsPrimitives";

export function AIEvaluationSection() {
  return (
    <Section icon={BrainCircuit} title="AI Evaluation" accent="secondary">
      <SettingRow
        label="Test Generation"
        value="Assessment Engine"
        description="Used for JD analysis and test generation"
      />
      <SettingRow
        label="Question Bank / Rubric Generation"
        value="Assessment Engine"
        description="Used for reusable question banks and review rubrics"
      />
      <SettingRow
        label="AI-Likeness Detection"
        value="Writing Analysis"
        description="Used for the AI Checker and candidate open-ended answers"
      />
      <SettingRow
        label="Evaluation Timeout"
        value="3 minutes"
        description="Maximum time allowed for AI evaluation per attempt"
      />
    </Section>
  );
}
