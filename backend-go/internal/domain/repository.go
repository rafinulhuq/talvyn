package domain

import "context"

// UserRepository handles user persistence.
type UserRepository interface {
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Create(ctx context.Context, user *User) error
	Update(ctx context.Context, user *User) error
}

// JobDescriptionRepository handles JD persistence.
type JobDescriptionRepository interface {
	GetByID(ctx context.Context, id string, ownerID *string) (*JobDescription, error)
	List(ctx context.Context, ownerID *string, limit, offset int) ([]JobDescription, error)
	Create(ctx context.Context, jd *JobDescription) error
	UpdateStatus(ctx context.Context, id string, status GenerationStatus) error
}

// TestRepository handles tests and questions.
type TestRepository interface {
	GetByID(ctx context.Context, id string) (*Test, error)
	GetByJdID(ctx context.Context, jdID string) ([]Test, error)
	GetQuestionsByTestID(ctx context.Context, testID string) ([]Question, error)
	CreateTest(ctx context.Context, test *Test) error
	CreateQuestions(ctx context.Context, questions []Question) error
}

// CandidateRepository handles candidate and invitation persistence.
type CandidateRepository interface {
	GetByID(ctx context.Context, id string) (*Candidate, error)
	GetByEmail(ctx context.Context, email string) (*Candidate, error)
	GetInvitationByTokenHash(ctx context.Context, tokenHash string) (*Invitation, error)
	CreateCandidate(ctx context.Context, candidate *Candidate) error
	CreateInvitation(ctx context.Context, invitation *Invitation) error
	UpdateInvitationStatus(ctx context.Context, id string, status InvitationStatus) error
}

// AttemptRepository handles test attempts, answers, and telemetry.
type AttemptRepository interface {
	GetByID(ctx context.Context, id string) (*TestAttempt, error)
	GetByInvitationAndTest(ctx context.Context, invitationID, testID string) (*TestAttempt, error)
	CreateAttempt(ctx context.Context, attempt *TestAttempt) error
	UpdateAttempt(ctx context.Context, attempt *TestAttempt) error
	SaveAnswer(ctx context.Context, answer *CandidateAnswer) error
	GetAnswers(ctx context.Context, attemptID string) ([]CandidateAnswer, error)
	LogSuspiciousEvent(ctx context.Context, event *SuspiciousEvent) error
	CountSuspiciousEvents(ctx context.Context, attemptID string, eventType string) (int, error)
}

// EvaluationRepository handles evaluation persistence.
type EvaluationRepository interface {
	GetByAttemptID(ctx context.Context, attemptID string) (*Evaluation, error)
	Save(ctx context.Context, evaluation *Evaluation) error
}
