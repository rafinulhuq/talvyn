"""
Per-model-family prompt registry.

Every Ollama-calling service (skill_extraction_service, test_generation_service,
evaluation_service, ai_detection_service) gets its prompt strings from
`get_prompt_set()` instead of hardcoding them — see registry.py for how a
model name resolves to a prompt set, and gemma.py / qwen.py for the actual
templates. See docs/ai-prompt-registry.md for how to add or tune a model
family.
"""

from app.prompts.registry import get_prompt_set
from app.prompts.types import (
    AIDetectionPrompts,
    EvaluationPrompts,
    ModelPromptSet,
    SkillExtractionPrompts,
    TestGenerationPrompts,
)

__all__ = [
    "AIDetectionPrompts",
    "EvaluationPrompts",
    "ModelPromptSet",
    "SkillExtractionPrompts",
    "TestGenerationPrompts",
    "get_prompt_set",
]
