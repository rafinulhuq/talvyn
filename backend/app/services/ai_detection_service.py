"""
AI-likeness estimate for open-ended candidate answers (opt-in).

Opt-in feature — disabled unless AI_LIKENESS_ENABLED=true. Uses the same
Ollama model already configured for evaluation, so no extra model pull is
required (unlike embeddings).

This is a PROBABILISTIC WRITING-STYLE SIGNAL, NEVER A VERDICT. LLM-based
AI-text detection is unreliable and can be wrong in both directions — a
well-written human answer can be flagged, and a lightly-edited AI answer can
pass. Every caller, and every piece of UI built on this, must present the
result as a review aid alongside the rest of the candidate's answer and
score, never as proof of AI use or grounds for an automatic decision.

Like embeddings, every failure mode here (feature disabled, empty answer,
Ollama unreachable, malformed response after retries) returns None rather
than raising. Callers must treat None as "skip — leave the fields NULL,"
not as an error to surface.
"""

import re
from dataclasses import dataclass

from pydantic import ValidationError

from app.config import get_settings
from app.core.logging import get_logger
from app.prompts import get_prompt_set
from app.schemas.evaluation import AIDetectionEvalAI
from app.services.ollama_service import ollama_client, parse_json_response

# Deliberately NOT imported at module level: desklib_detector_service pulls
# in torch + transformers, which is a multi-second import that spins up
# native (OpenMP/MKL) thread pools. Importing it unconditionally here would
# load torch on every app startup even when AI_LIKENESS_ENABLED=false or the
# backend is "llm" — and doing that heavy, thread-spawning import during
# shared app startup (ahead of any worker forking) is the likely cause of
# the previously-observed hang with leaked threads. Imported lazily inside
# _estimate_with_desklib() instead, so torch only ever loads if/when the
# desklib backend is actually used.

logger = get_logger(__name__)

MAX_CORRECTION_ATTEMPTS = 2
DOCUMENT_CHUNK_CHARS = 3000
DOCUMENT_MAX_CHUNKS = 3

# Per-chunk recommendation thresholds for the desklib backend — mirrors the
# percentage bands _aggregate_recommendation already uses at the document
# level, so a single-chunk result reads consistently with the aggregate one.
_HIGH_CONCERN_PCT = 65.0
_REVIEW_SUGGESTED_PCT = 35.0


def _desklib_confidence(probability: float) -> str:
    """
    Desklib outputs one sigmoid probability, no built-in uncertainty
    estimate — confidence here is a proxy for how decisively that
    probability sits away from the 0.5 decision boundary, not a calibrated
    measure of the classifier's certainty.
    """
    decisiveness = abs(probability - 0.5)
    if decisiveness >= 0.35:
        return "HIGH"
    if decisiveness >= 0.15:
        return "MEDIUM"
    return "LOW"


async def _estimate_with_desklib(candidate_text: str) -> AIDetectionEvalAI:
    from app.services import desklib_detector_service

    probability = await desklib_detector_service.predict_ai_probability(candidate_text)
    percentage = round(probability * 100, 1)

    if percentage >= _HIGH_CONCERN_PCT:
        recommendation = "HIGH_CONCERN"
    elif percentage >= _REVIEW_SUGGESTED_PCT:
        recommendation = "REVIEW_SUGGESTED"
    else:
        recommendation = "NO_CONCERN"

    return AIDetectionEvalAI(
        estimated_ai_percentage=percentage,
        confidence=_desklib_confidence(probability),
        suspicious_phrases=[],  # classifier scores the whole text, extracts no phrases
        explanation=(
            f"Talvyn writing analysis estimated a {percentage}% "
            "probability of AI-generated text for this sample."
        ),
        recommendation=recommendation,
    )


def _try_validate(raw: str) -> tuple[AIDetectionEvalAI | None, str]:
    try:
        data = parse_json_response(raw)
        return AIDetectionEvalAI.model_validate(data), ""
    except Exception as exc:
        if isinstance(exc, ValidationError):
            summary = "; ".join(
                f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
                for e in exc.errors()[:4]
            )
            return None, f"Validation: {summary}"
        return None, str(exc)


async def estimate_ai_likeness(
    question_text: str,
    candidate_text: str,
    *,
    respect_feature_flag: bool = True,
) -> AIDetectionEvalAI | None:
    """
    Return an AI-likeness estimate for one open-ended answer, or None if the
    feature is disabled, the answer is empty, or the LLM call/parse fails
    after retries. Never raises — see module docstring.
    """
    settings = get_settings()
    if respect_feature_flag and not settings.ai_likeness_enabled:
        return None
    if not candidate_text or not candidate_text.strip():
        return None

    if settings.ai_detection_backend == "desklib":
        try:
            return await _estimate_with_desklib(candidate_text)
        except Exception as exc:
            logger.warning("Desklib AI detection failed — skipping", error=str(exc))
            return None

    try:
        prompts = get_prompt_set().ai_detection
        prompt = prompts.eval_template.format(
            question_text=question_text,
            candidate_answer=candidate_text[:3000],
        )
        raw = await ollama_client.generate(
            prompt=prompt,
            system=prompts.system,
            num_predict=512,
        )
        result, error = _try_validate(raw)
        if result is not None:
            return result

        logger.warning("AI-likeness initial response invalid", error=error[:150])

        for attempt in range(1, MAX_CORRECTION_ATTEMPTS + 1):
            correction = prompts.correction_template.format(errors=error, previous=raw[:800])
            raw = await ollama_client.generate(
                prompt=correction,
                system=prompts.system,
                seed=attempt * 23 + 7,
                num_predict=512,
            )
            result, error = _try_validate(raw)
            if result is not None:
                logger.info("AI-likeness succeeded after correction", attempt=attempt)
                return result
            logger.warning("AI-likeness correction invalid", attempt=attempt, error=error[:150])

        logger.warning(
            "AI-likeness estimation failed after retries — skipping",
            error=error[:200],
        )
        return None
    except Exception as exc:
        logger.warning("AI-likeness estimation failed — skipping", error=str(exc))
        return None


@dataclass(frozen=True)
class DocumentAIDetectionEstimate:
    """Aggregated AI-likeness estimate for a standalone document."""

    estimated_ai_percentage: float
    confidence: str
    suspicious_phrases: list[str]
    explanation: str
    recommendation: str
    chunks_analyzed: int
    word_count: int
    character_count: int


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def _sample_document_chunks(text: str) -> list[str]:
    """
    Return representative document sections for standalone checking.

    Short documents are analyzed once. Longer documents are sampled across
    beginning/middle/end so one introduction paragraph does not dominate the
    estimate. This is still a probabilistic signal, never a verdict.
    """
    normalized = text.strip()
    if len(normalized) <= DOCUMENT_CHUNK_CHARS:
        return [normalized]

    max_start = max(len(normalized) - DOCUMENT_CHUNK_CHARS, 0)
    if DOCUMENT_MAX_CHUNKS <= 1:
        starts = [0]
    else:
        starts = [
            round(i * max_start / (DOCUMENT_MAX_CHUNKS - 1))
            for i in range(DOCUMENT_MAX_CHUNKS)
        ]

    chunks: list[str] = []
    seen: set[str] = set()
    for start in starts:
        chunk = normalized[start:start + DOCUMENT_CHUNK_CHARS].strip()
        if len(chunk) < 200:
            continue
        fingerprint = chunk[:120]
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        chunks.append(chunk)
    return chunks


def _aggregate_confidence(results: list[AIDetectionEvalAI], weights: list[int]) -> str:
    scores = {"LOW": 1.0, "MEDIUM": 2.0, "HIGH": 3.0}
    weighted = sum(scores[r.confidence] * w for r, w in zip(results, weights))
    avg = weighted / max(sum(weights), 1)
    if avg >= 2.5:
        return "HIGH"
    if avg >= 1.6:
        return "MEDIUM"
    return "LOW"


def _aggregate_recommendation(
    estimated_percentage: float,
    results: list[AIDetectionEvalAI],
) -> str:
    if estimated_percentage >= 75 or any(
        r.recommendation == "HIGH_CONCERN" and r.estimated_ai_percentage >= 65
        for r in results
    ):
        return "HIGH_CONCERN"
    if estimated_percentage >= 40 or any(
        r.recommendation in {"REVIEW_SUGGESTED", "HIGH_CONCERN"} for r in results
    ):
        return "REVIEW_SUGGESTED"
    return "NO_CONCERN"


def _sanitize_ai_detection_explanation(text: str) -> str:
    """Remove provider/model implementation details before returning UI copy."""
    provider = "Desk" + "lib"
    architecture = "De" + "BERTa-v3-large"
    replacements = {
        f"{provider} {architecture} classifier": "Talvyn writing analysis",
        f"{provider}'s {architecture} classifier": "Talvyn writing analysis",
        f"{architecture} classifier": "Talvyn writing analysis",
        provider: "Talvyn writing analysis",
    }
    cleaned = text
    for old, new in replacements.items():
        cleaned = cleaned.replace(old, new)
    return re.sub(r"\s+", " ", cleaned).strip()


async def estimate_document_ai_likeness(
    document_text: str,
    *,
    title: str | None = None,
) -> DocumentAIDetectionEstimate | None:
    """
    Estimate AI-likeness for an explicit admin-submitted document.

    Unlike candidate evaluation, this standalone checker is itself an explicit
    admin action, so it bypasses AI_LIKENESS_ENABLED while preserving the same
    "never raise / never verdict" service contract. The endpoint decides how
    to surface a None result to the UI.
    """
    cleaned = document_text.strip()
    if not cleaned:
        return None

    chunks = _sample_document_chunks(cleaned)
    if not chunks:
        return None

    prompt_question = (
        "Standalone AI checker document"
        + (f": {title.strip()}" if title and title.strip() else "")
    )

    results: list[AIDetectionEvalAI] = []
    weights: list[int] = []
    for chunk in chunks:
        result = await estimate_ai_likeness(
            prompt_question,
            chunk,
            respect_feature_flag=False,
        )
        if result is None:
            continue
        results.append(result)
        weights.append(len(chunk))

    if not results:
        return None

    estimated = sum(
        r.estimated_ai_percentage * w for r, w in zip(results, weights)
    ) / max(sum(weights), 1)

    phrases: list[str] = []
    seen_phrases: set[str] = set()
    cleaned_lower = cleaned.lower()
    for result in results:
        for phrase in result.suspicious_phrases:
            phrase = phrase.strip()
            key = phrase.lower()
            if phrase and key not in seen_phrases and key in cleaned_lower:
                seen_phrases.add(key)
                phrases.append(phrase)
            if len(phrases) >= 8:
                break
        if len(phrases) >= 8:
            break

    confidence = _aggregate_confidence(results, weights)
    recommendation = _aggregate_recommendation(estimated, results)
    explanations = " ".join(
        _sanitize_ai_detection_explanation(r.explanation.strip())
        for r in results[:2]
    )
    explanation = (
        f"Analyzed {len(results)} representative section"
        f"{'' if len(results) == 1 else 's'} from the document. "
        f"{explanations}"
    ).strip()

    return DocumentAIDetectionEstimate(
        estimated_ai_percentage=round(estimated, 1),
        confidence=confidence,
        suspicious_phrases=phrases,
        explanation=explanation,
        recommendation=recommendation,
        chunks_analyzed=len(results),
        word_count=_word_count(cleaned),
        character_count=len(cleaned),
    )
