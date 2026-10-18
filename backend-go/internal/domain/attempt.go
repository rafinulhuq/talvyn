package domain

import (
	"encoding/json"
	"time"
)

// TestAttempt represents a single candidate session for a test.
type TestAttempt struct {
	ID                   string        `json:"id"`
	InvitationID         string        `json:"invitation_id"`
	CandidateID          string        `json:"candidate_id"`
	TestID               string        `json:"test_id"`
	StartedAt            *time.Time    `json:"started_at,omitempty"`
	SubmittedAt          *time.Time    `json:"submitted_at,omitempty"`
	TimeRemainingSeconds *int          `json:"time_remaining_seconds,omitempty"`
	Status               AttemptStatus `json:"status"`
	IPAddress            *string       `json:"ip_address,omitempty"`
	AutoSubmitted        bool          `json:"auto_submitted"`

	// Relational fields
	Invitation *Invitation       `json:"invitation,omitempty"`
	Candidate  *Candidate        `json:"candidate,omitempty"`
	Test       *Test             `json:"test,omitempty"`
	Answers    []CandidateAnswer `json:"answers,omitempty"`
	Evaluation *Evaluation       `json:"evaluation,omitempty"`
	Events     []SuspiciousEvent `json:"events,omitempty"`
}

// CandidateAnswer records candidate input for a specific question.
type CandidateAnswer struct {
	ID             string    `json:"id"`
	AttemptID      string    `json:"attempt_id"`
	QuestionID     string    `json:"question_id"`
	SelectedOption *string   `json:"selected_option,omitempty"`
	AnswerText     *string   `json:"answer_text,omitempty"`
	IsAutoScored   bool      `json:"is_auto_scored"`
	AutoScore      *int      `json:"auto_score,omitempty"`
	SavedAt        time.Time `json:"saved_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// SuspiciousEvent captures anti-cheat telemetry events during assessment.
type SuspiciousEvent struct {
	ID         string          `json:"id"`
	AttemptID  string          `json:"attempt_id"`
	EventType  string          `json:"event_type"`
	OccurredAt time.Time       `json:"occurred_at"`
	Metadata   json.RawMessage `json:"metadata,omitempty"`
}
