package main

import (
	"context"
	"testing"
)

func TestDeterministicHeuristicGrader(t *testing.T) {
	engine := NewEvaluationEngine(nil, nil, "http://localhost:11434")

	correctOption := "B"
	questions := []QuestionData{
		{
			ID:            "q1",
			QuestionType:  "MCQ",
			QuestionText:  "What is the time complexity of binary search?",
			Marks:         20,
			CorrectAnswer: &correctOption,
		},
		{
			ID:           "q2",
			QuestionType: "CODE",
			QuestionText: "Implement a function to reverse a string.",
			Marks:        40,
		},
		{
			ID:           "q3",
			QuestionType: "OPEN_ENDED",
			QuestionText: "Explain ACID properties in relational databases.",
			Marks:        40,
		},
	}

	selectedOption := "B"
	codeAnswer := "func reverseString(s string) string { return s }"
	openEndedAnswer := "ACID stands for Atomicity, Consistency, Isolation, and Durability. Atomicity ensures all or nothing. Consistency ensures database state transitions remain valid. Isolation ensures concurrent transactions do not interfere. Durability guarantees committed data survives system crashes."

	answers := []CandidateAnswerData{
		{
			QuestionID:     "q1",
			SelectedOption: &selectedOption,
		},
		{
			QuestionID: "q2",
			AnswerText: &codeAnswer,
		},
		{
			QuestionID: "q3",
			AnswerText: &openEndedAnswer,
		},
	}

	result := engine.gradeWithDeterministicHeuristics("attempt_test_123", questions, answers)

	if result.TotalScore < 80 {
		t.Fatalf("expected high score for correct answers, got %d", result.TotalScore)
	}

	if result.MCQScore != 20 {
		t.Fatalf("expected MCQ score 20, got %d", result.MCQScore)
	}

	if result.AIRecommendation != "STRONG_HIRE" && result.AIRecommendation != "HIRE" {
		t.Fatalf("expected HIRE or STRONG_HIRE, got %s", result.AIRecommendation)
	}

	if len(result.Strengths) == 0 {
		t.Fatalf("expected identified strengths, got none")
	}

	t.Logf("Evaluated Result: Score=%d/%d (%.1f%%), Recommendation=%s",
		result.TotalScore, result.MaxScore, result.Percentage, result.AIRecommendation)
}

func TestZeroCostLocalGradingWithoutOllama(t *testing.T) {
	// Points to an invalid Ollama host to prove seamless zero-cost fallback
	engine := NewEvaluationEngine(nil, nil, "http://127.0.0.1:9999")

	ctx := context.Background()
	result, err := engine.GradeAttempt(ctx, "attempt_fallback_test")
	if err != nil {
		t.Fatalf("expected successful fallback grading, got error: %v", err)
	}

	if result.TotalScore == 0 {
		t.Fatalf("expected non-zero fallback score")
	}

	if result.AIRecommendation == "" {
		t.Fatalf("expected AI recommendation")
	}

	t.Logf("Fallback Grading Verified: %s, Score=%d%%", result.AIRecommendation, result.TotalScore)
}
