package domain

import (
	"encoding/json"
	"time"
)

// Test represents an assessment section or standalone test.
type Test struct {
	ID              string     `json:"id"`
	JdID            string     `json:"jd_id"`
	TestType        TestType   `json:"test_type"`
	Title           string     `json:"title"`
	Description     *string    `json:"description,omitempty"`
	DurationMinutes int        `json:"duration_minutes"`
	TotalMarks      int        `json:"total_marks"`
	PassingMarks    *int       `json:"passing_marks,omitempty"`
	Difficulty      Difficulty `json:"difficulty"`
	Status          TestStatus `json:"status"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty"`

	// Relational fields
	Questions []Question `json:"questions,omitempty"`
}

// Question represents an individual question in a test.
type Question struct {
	ID             string          `json:"id"`
	TestID         string          `json:"test_id"`
	QuestionType   QuestionType    `json:"question_type"`
	QuestionText   string          `json:"question_text"`
	SkillTested    *string         `json:"skill_tested,omitempty"`
	Difficulty     Difficulty      `json:"difficulty"`
	Marks          int             `json:"marks"`
	OrderIndex     int             `json:"order_index"`
	Options        json.RawMessage `json:"options,omitempty"`
	CorrectAnswer  *string         `json:"correct_answer,omitempty"`
	Explanation    *string         `json:"explanation,omitempty"`
	ExpectedAnswer *string         `json:"expected_answer,omitempty"`
	ScoringRubric  *string         `json:"scoring_rubric,omitempty"`
	CodeLanguage   *string         `json:"code_language,omitempty"`
	CodeStarter    *string         `json:"code_starter,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// SanitizedQuestion returns question without answers or rubrics for candidates.
type SanitizedQuestion struct {
	ID           string          `json:"id"`
	TestID       string          `json:"test_id"`
	QuestionType QuestionType    `json:"question_type"`
	QuestionText string          `json:"question_text"`
	SkillTested  *string         `json:"skill_tested,omitempty"`
	Difficulty   Difficulty      `json:"difficulty"`
	Marks        int             `json:"marks"`
	OrderIndex   int             `json:"order_index"`
	Options      json.RawMessage `json:"options,omitempty"`
	CodeLanguage *string         `json:"code_language,omitempty"`
	CodeStarter  *string         `json:"code_starter,omitempty"`
}

// Sanitize strips solution metadata before serving to candidate cockpits.
func (q *Question) Sanitize() SanitizedQuestion {
	return SanitizedQuestion{
		ID:           q.ID,
		TestID:       q.TestID,
		QuestionType: q.QuestionType,
		QuestionText: q.QuestionText,
		SkillTested:  q.SkillTested,
		Difficulty:   q.Difficulty,
		Marks:        q.Marks,
		OrderIndex:   q.OrderIndex,
		Options:      q.Options,
		CodeLanguage: q.CodeLanguage,
		CodeStarter:  q.CodeStarter,
	}
}
