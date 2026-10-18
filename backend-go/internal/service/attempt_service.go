package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"talvyn-backend/internal/domain"
	"talvyn-backend/internal/repository/postgres"
	"talvyn-backend/pkg/token"
)

// AttemptService orchestrates candidate test session lifecycles and telemetry.
type AttemptService struct {
	repo      *postgres.Repository
	appSecret string
}

// NewAttemptService creates a new AttemptService instance.
func NewAttemptService(repo *postgres.Repository, appSecret string) *AttemptService {
	return &AttemptService{
		repo:      repo,
		appSecret: appSecret,
	}
}

// StartAttemptResponse contains test metadata and sanitized questions for the candidate cockpit.
type StartAttemptResponse struct {
	AttemptID            string                    `json:"attempt_id"`
	TestID               string                    `json:"test_id"`
	Title                string                    `json:"title"`
	DurationMinutes      int                       `json:"duration_minutes"`
	TimeRemainingSeconds int                       `json:"time_remaining_seconds"`
	Status               domain.AttemptStatus      `json:"status"`
	Questions            []domain.SanitizedQuestion `json:"questions"`
	Answers              []domain.CandidateAnswer  `json:"answers"`
}

// StartAttempt begins or resumes a test session using the candidate's magic link token.
func (s *AttemptService) StartAttempt(ctx context.Context, rawToken string, testIndex int, ipAddress *string) (*StartAttemptResponse, error) {
	tokenHash := token.HashToken(rawToken, s.appSecret)

	invitation, err := s.repo.GetInvitationByTokenHash(ctx, tokenHash)
	if err != nil {
		return nil, domain.ErrNotFound
	}

	if !token.VerifyToken(rawToken, invitation.TokenHash, s.appSecret) {
		return nil, domain.ErrUnauthorized
	}

	if invitation.IsExpired() {
		return nil, domain.ErrTokenExpired
	}

	if invitation.Status == domain.InvitationStatusTerminated || invitation.Status == domain.InvitationStatusRevoked {
		return nil, domain.ErrForbidden
	}

	// Fetch JD and tests
	jd, err := s.repo.GetJdByID(ctx, invitation.JdID, nil)
	if err != nil {
		return nil, fmt.Errorf("job description not found: %w", err)
	}
	_ = jd

	// In real workflow, find test matching testIndex or default test
	// For demonstration, fetch test by ID or mock ID
	testID := "test-" + invitation.JdID
	test, err := s.repo.GetTestByID(ctx, testID)
	if err != nil {
		// Fallback for demo/unseeded tests
		test = &domain.Test{
			ID:              testID,
			JdID:            invitation.JdID,
			TestType:        domain.TestTypeTechnical,
			Title:           "Technical Assessment",
			DurationMinutes: 60,
			TotalMarks:      100,
			Difficulty:      domain.DifficultyMedium,
			Status:          domain.TestStatusApproved,
		}
	}

	rawQuestions, err := s.repo.GetQuestionsByTestID(ctx, test.ID)
	if err != nil {
		rawQuestions = []domain.Question{}
	}

	sanitized := make([]domain.SanitizedQuestion, len(rawQuestions))
	for i, q := range rawQuestions {
		sanitized[i] = q.Sanitize()
	}

	now := time.Now()
	totalSeconds := test.DurationMinutes * 60
	attempt := &domain.TestAttempt{
		ID:                   uuid.New().String(),
		InvitationID:         invitation.ID,
		CandidateID:          invitation.CandidateID,
		TestID:               test.ID,
		StartedAt:            &now,
		TimeRemainingSeconds: &totalSeconds,
		Status:               domain.AttemptStatusInProgress,
		IPAddress:            ipAddress,
		AutoSubmitted:        false,
	}

	if err := s.repo.CreateAttempt(ctx, attempt); err != nil {
		return nil, fmt.Errorf("failed to initialize attempt: %w", err)
	}

	return &StartAttemptResponse{
		AttemptID:            attempt.ID,
		TestID:               test.ID,
		Title:                test.Title,
		DurationMinutes:      test.DurationMinutes,
		TimeRemainingSeconds: totalSeconds,
		Status:               attempt.Status,
		Questions:            sanitized,
		Answers:              []domain.CandidateAnswer{},
	}, nil
}

// GetAttemptState retrieves current attempt state and remaining duration.
func (s *AttemptService) GetAttemptState(ctx context.Context, attemptID, rawToken string) (*StartAttemptResponse, error) {
	attempt, err := s.repo.GetAttemptByID(ctx, attemptID)
	if err != nil {
		return nil, domain.ErrNotFound
	}

	if attempt.Status == domain.AttemptStatusTerminated {
		return nil, domain.ErrAttemptTerminated
	}

	test, err := s.repo.GetTestByID(ctx, attempt.TestID)
	if err != nil {
		test = &domain.Test{
			ID:              attempt.TestID,
			Title:           "Assessment",
			DurationMinutes: 60,
		}
	}

	rawQuestions, _ := s.repo.GetQuestionsByTestID(ctx, test.ID)
	sanitized := make([]domain.SanitizedQuestion, len(rawQuestions))
	for i, q := range rawQuestions {
		sanitized[i] = q.Sanitize()
	}

	answers, _ := s.repo.GetAnswers(ctx, attemptID)

	remSeconds := 0
	if attempt.StartedAt != nil {
		elapsed := int(time.Since(*attempt.StartedAt).Seconds())
		total := test.DurationMinutes * 60
		remSeconds = total - elapsed
		if remSeconds < 0 {
			remSeconds = 0
		}
	}

	return &StartAttemptResponse{
		AttemptID:            attempt.ID,
		TestID:               test.ID,
		Title:                test.Title,
		DurationMinutes:      test.DurationMinutes,
		TimeRemainingSeconds: remSeconds,
		Status:               attempt.Status,
		Questions:            sanitized,
		Answers:              answers,
	}, nil
}

// SaveAnswer autosaves a single candidate response.
func (s *AttemptService) SaveAnswer(ctx context.Context, attemptID, questionID string, selectedOption, answerText *string) error {
	attempt, err := s.repo.GetAttemptByID(ctx, attemptID)
	if err != nil {
		return domain.ErrNotFound
	}

	if attempt.Status != domain.AttemptStatusInProgress {
		return domain.ErrConflict
	}

	answer := &domain.CandidateAnswer{
		ID:             uuid.New().String(),
		AttemptID:      attemptID,
		QuestionID:     questionID,
		SelectedOption: selectedOption,
		AnswerText:     answerText,
	}

	return s.repo.SaveAnswer(ctx, answer)
}

// Heartbeat synchronizes the timer server-side.
func (s *AttemptService) Heartbeat(ctx context.Context, attemptID string, elapsedSeconds int) (int, error) {
	attempt, err := s.repo.GetAttemptByID(ctx, attemptID)
	if err != nil {
		return 0, domain.ErrNotFound
	}

	if attempt.Status != domain.AttemptStatusInProgress {
		return 0, domain.ErrConflict
	}

	test, _ := s.repo.GetTestByID(ctx, attempt.TestID)
	duration := 60
	if test != nil && test.DurationMinutes > 0 {
		duration = test.DurationMinutes
	}

	totalSeconds := duration * 60
	remSeconds := totalSeconds - elapsedSeconds
	if remSeconds < 0 {
		remSeconds = 0
	}

	attempt.TimeRemainingSeconds = &remSeconds
	_ = s.repo.UpdateAttempt(ctx, attempt)

	return remSeconds, nil
}

// LogSuspiciousEvent records telemetry and executes progressive 3-strike protocol.
func (s *AttemptService) LogSuspiciousEvent(ctx context.Context, attemptID, eventType string, metadata []byte) (int, bool, error) {
	attempt, err := s.repo.GetAttemptByID(ctx, attemptID)
	if err != nil {
		return 0, false, domain.ErrNotFound
	}

	event := &domain.SuspiciousEvent{
		ID:        uuid.New().String(),
		AttemptID: attemptID,
		EventType: eventType,
		Metadata:  metadata,
	}

	if err := s.repo.LogSuspiciousEvent(ctx, event); err != nil {
		return 0, false, err
	}

	count, err := s.repo.CountSuspiciousEvents(ctx, attemptID, eventType)
	if err != nil {
		return 1, false, nil
	}

	terminated := false
	if count >= 3 {
		attempt.Status = domain.AttemptStatusTerminated
		_ = s.repo.UpdateAttempt(ctx, attempt)
		terminated = true
	}

	return count, terminated, nil
}

// Submit finalizes an assessment attempt.
func (s *AttemptService) Submit(ctx context.Context, attemptID string) error {
	attempt, err := s.repo.GetAttemptByID(ctx, attemptID)
	if err != nil {
		return domain.ErrNotFound
	}

	now := time.Now()
	attempt.SubmittedAt = &now
	attempt.Status = domain.AttemptStatusSubmitted

	return s.repo.UpdateAttempt(ctx, attempt)
}
