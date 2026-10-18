"""
Unit tests for app/schemas/ai_orchestration.py — the GLM question-bank
generation schemas. No Ollama/DB needed.
"""

from app.schemas.ai_orchestration import GlmMcqQuestionAI


def _make_glm_mcq(correct: str = "B") -> dict:
    return {
        "question_text": "What does 'inter-annotator agreement' primarily measure?",
        "options": [
            {"label": "A", "text": "Annotation speed", "is_correct": False},
            {"label": "B", "text": "Consistency across annotators", "is_correct": correct == "B"},
            {"label": "C", "text": "Dataset size", "is_correct": correct == "C"},
            {"label": "D", "text": "Model accuracy", "is_correct": False},
        ],
        "correct_answer": correct,
        "explanation": "Inter-annotator agreement measures consistency across annotators.",
        "difficulty": "MEDIUM",
        "skill_tags": ["QA"],
        "topic_tags": ["Annotation"],
        "estimated_time_seconds": 60,
    }


class TestGlmMcqQuestionAI:

    def test_valid_mcq(self):
        mcq = GlmMcqQuestionAI.model_validate(_make_glm_mcq())
        correct = next(opt for opt in mcq.options if opt.is_correct)
        assert mcq.correct_answer == correct.label
        assert correct.text == "Consistency across annotators"

    def test_repairs_correct_answer_mismatch(self):
        data = _make_glm_mcq(correct="B")
        data["correct_answer"] = "C"  # mismatched — is_correct is on B, not C
        mcq = GlmMcqQuestionAI.model_validate(data)
        correct = next(opt for opt in mcq.options if opt.is_correct)
        assert mcq.correct_answer == correct.label
        assert sum(1 for opt in mcq.options if opt.is_correct) == 1

    def test_correct_answer_position_is_randomized(self):
        labels_seen = {
            GlmMcqQuestionAI.model_validate(_make_glm_mcq()).correct_answer
            for _ in range(200)
        }
        # Negligible flake probability: landing on the same label 200/200 times is ~(1/4)^199
        assert len(labels_seen) > 1
