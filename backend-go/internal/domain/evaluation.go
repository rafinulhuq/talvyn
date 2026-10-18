package domain

import (
	"encoding/json"
	"time"
)

// Evaluation represents automated and manual grading for a test attempt.
type Evaluation struct {
	ID                          string            `json:"id"`
	AttemptID                   string            `json:"attempt_id"`
	TotalScore                  int               `json:"total_score"`
	MaxScore                    int               `json:"max_score"`
	Percentage                  float64           `json:"percentage"`
	MCQScore                    int               `json:"mcq_score"`
	OpenEndedScore              int               `json:"open_ended_score"`
	AIStrengths                 json.RawMessage   `json:"ai_strengths"`
	AIWeaknesses                json.RawMessage   `json:"ai_weaknesses"`
	AIRecommendation            AIRecommendation  `json:"ai_recommendation"`
	AISummary                   string            `json:"ai_summary"`
	AdminOverrideRecommendation *AIRecommendation `json:"admin_override_recommendation,omitempty"`
	AdminNotes                  *string           `json:"admin_notes,omitempty"`
	EvaluatedAt                 time.Time         `json:"evaluated_at"`
	IsPreliminary               bool              `json:"is_preliminary"`

	// Relational fields
	Attempt *TestAttempt `json:"attempt,omitempty"`
}
