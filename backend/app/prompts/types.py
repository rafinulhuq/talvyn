"""
Shared dataclasses describing the prompt strings each Ollama-calling service
needs. One ModelPromptSet bundles everything for every task (skill
extraction, test generation, evaluation, AI-likeness detection) so a single
model family — see prompts/gemma.py, prompts/qwen.py — can be selected as a
whole via the registry in prompts/registry.py.

These are plain `.format()` templates (matching the rest of the codebase's
existing prompt style), not a templating engine — keep that consistent
when adding a new model family.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SkillExtractionPrompts:
    system: str
    extraction_template: str
    correction_template: str


@dataclass(frozen=True)
class TestGenerationPrompts:
    system: str
    generation_template: str
    correction_template: str


@dataclass(frozen=True)
class EvaluationPrompts:
    # Open-ended + code evaluation share one system prompt today (the code
    # eval prompt itself carries the code-specific instructions).
    oe_system: str
    oe_eval_template: str
    oe_correction_template: str
    code_eval_template: str
    agg_system: str
    agg_eval_template: str
    agg_correction_template: str


@dataclass(frozen=True)
class AIDetectionPrompts:
    system: str
    eval_template: str
    correction_template: str


@dataclass(frozen=True)
class ModelPromptSet:
    """Everything one model family needs across all 4 Ollama-calling tasks."""

    skill_extraction: SkillExtractionPrompts
    test_generation: TestGenerationPrompts
    evaluation: EvaluationPrompts
    ai_detection: AIDetectionPrompts
