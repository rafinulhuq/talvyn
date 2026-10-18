"""
Desklib AI text detector (DeBERTa-v3-large classifier, opt-in via
AI_DETECTION_BACKEND=desklib).

Unlike ai_detection_service's default "llm" backend (which prompts the
configured Ollama/GLM model to self-report a writing-style judgment), this
loads desklib/ai-text-detector-v1.01 directly via transformers/torch and
runs a real classification forward pass — a trained probability, not an
LLM's opinion of itself. Architecture is the one published on the model
card: mean-pool the DeBERTa-v3-large hidden states, then a single linear
head, then sigmoid.

CPU-only by design — this server's GPU is already near its VRAM ceiling
running Ollama for JD extraction/test generation/evaluation, and a single
forward pass over up to 768 tokens is fast enough on CPU for the
background-job workload this feeds (AI Checker, candidate answer review).

The model is loaded once per process (lazy, thread-safe) and reused —
loading involves a multi-hundred-MB weight read, never repeat it per call.
"""

import asyncio
import os
import threading
from typing import Any

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

MAX_SEQ_LEN = 768

# TOKENIZERS_PARALLELISM must be set before `tokenizers` is ever imported —
# its own internal Rust thread pool is the documented cause of hangs when a
# process forks after that pool already exists (uvicorn --workers N). This
# whole module's heavy imports are deferred to _ensure_loaded() (see below)
# specifically so that import never happens before forking; this env var is
# the second half of that same fix, set here so it's in place no matter
# which thread first imports `transformers`.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

_load_lock = threading.Lock()
_model: "Any | None" = None
_tokenizer: "Any | None" = None
_model_class: "type | None" = None


def _build_model_class() -> type:
    """
    Defines DesklibAIDetectionModel lazily — it subclasses PreTrainedModel,
    which requires torch/transformers already imported, so the class itself
    can't exist at module level without forcing the same eager import this
    module exists to avoid.
    """
    import torch
    from torch import nn
    from transformers import AutoConfig, AutoModel, PreTrainedModel

    class DesklibAIDetectionModel(PreTrainedModel):
        """Mean-pooled DeBERTa-v3-large + linear head, per the published model card."""

        config_class = AutoConfig

        def __init__(self, config):
            super().__init__(config)
            self.model = AutoModel.from_config(config)
            self.classifier = nn.Linear(config.hidden_size, 1)
            # post_init() (not init_weights() directly) — it sets up
            # all_tied_weights_keys and other bookkeeping from_pretrained()
            # needs, then calls init_weights() itself.
            self.post_init()

        def forward(self, input_ids, attention_mask=None):
            outputs = self.model(input_ids, attention_mask=attention_mask)
            last_hidden_state = outputs[0]
            mask_expanded = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()
            sum_embeddings = torch.sum(last_hidden_state * mask_expanded, dim=1)
            sum_mask = torch.clamp(mask_expanded.sum(dim=1), min=1e-9)
            pooled_output = sum_embeddings / sum_mask
            return self.classifier(pooled_output)

    return DesklibAIDetectionModel


def _ensure_loaded() -> tuple[Any, Any]:
    global _model, _tokenizer, _model_class
    if _model is not None and _tokenizer is not None:
        return _model, _tokenizer

    with _load_lock:
        if _model is not None and _tokenizer is not None:
            return _model, _tokenizer

        from transformers import AutoTokenizer

        if _model_class is None:
            _model_class = _build_model_class()

        model_name = get_settings().desklib_model_name
        logger.info("Loading Desklib AI detector model", model=model_name)
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = _model_class.from_pretrained(model_name)
        model.to("cpu")
        model.eval()

        _model, _tokenizer = model, tokenizer
        logger.info("Desklib AI detector model loaded", model=model_name)
        return _model, _tokenizer


def _predict_blocking(text: str) -> float:
    """Synchronous forward pass — always run via asyncio.to_thread, never directly."""
    import torch

    model, tokenizer = _ensure_loaded()

    encoded = tokenizer(
        text,
        padding="max_length",
        truncation=True,
        max_length=MAX_SEQ_LEN,
        return_tensors="pt",
    )
    with torch.no_grad():
        logits = model(input_ids=encoded["input_ids"], attention_mask=encoded["attention_mask"])
    return torch.sigmoid(logits).item()


async def predict_ai_probability(text: str) -> float:
    """
    Return the probability (0.0-1.0) that `text` is AI-generated, per
    Desklib's DeBERTa-v3-large classifier. Runs the blocking forward pass in
    a worker thread so it never stalls the asyncio event loop.
    """
    return await asyncio.to_thread(_predict_blocking, text)
