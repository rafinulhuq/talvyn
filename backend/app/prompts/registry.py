"""
Resolves the configured OLLAMA_MODEL to a ModelPromptSet.

Switching models is still env-var driven (set OLLAMA_MODEL, restart the
backend + worker) — this registry doesn't add a live-switch UI, it just
makes sure the prompts switch along with the model instead of silently
reusing Gemma-tuned wording against a different model family.

Matching is by family keyword, not exact tag, so any tag within a family
(qwen2.5-coder:7b, qwen2.5-coder:14b, a future qwen3 variant, ...) picks up
that family's prompt set without registry changes. Add a new family by
writing a new module next to gemma.py/qwen.py and registering it below —
nothing else in the codebase needs to change.
"""

from app.prompts.gemma import GEMMA_PROMPTS
from app.prompts.qwen import QWEN_PROMPTS
from app.prompts.types import ModelPromptSet

# Order matters only in that the first matching keyword wins — keep entries
# unambiguous (no two keywords should both match a real model name).
_FAMILY_KEYWORDS: list[tuple[str, ModelPromptSet]] = [
    ("qwen", QWEN_PROMPTS),
    ("gemma", GEMMA_PROMPTS),
]

# Default for any model name that matches no known family — keeps an
# unrecognised OLLAMA_MODEL value behaving like the only prompt set this
# app has actually shipped against, rather than failing or guessing.
DEFAULT_PROMPTS = GEMMA_PROMPTS


def get_prompt_set(model_name: str | None = None) -> ModelPromptSet:
    """
    Return the ModelPromptSet for the given model name (or the configured
    OLLAMA_MODEL if not given), matched by family keyword.
    """
    if model_name is None:
        from app.config import get_settings

        model_name = get_settings().ollama_model

    name = model_name.lower()
    for keyword, prompt_set in _FAMILY_KEYWORDS:
        if keyword in name:
            return prompt_set
    return DEFAULT_PROMPTS
