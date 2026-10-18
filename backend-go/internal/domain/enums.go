package domain

// Role defines user access hierarchy.
type Role string

const (
	RoleUser       Role = "USER"
	RoleAdmin      Role = "ADMIN"
	RoleSuperAdmin Role = "SUPER_ADMIN"
	RoleDev        Role = "DEV"
)

// RoleRank maps roles to their privilege integer.
var RoleRank = map[Role]int{
	RoleUser:       1,
	RoleAdmin:      2,
	RoleSuperAdmin: 3,
}

// FileType represents supported upload formats.
type FileType string

const (
	FileTypePDF  FileType = "PDF"
	FileTypeDOCX FileType = "DOCX"
)

// ParseStatus represents JD file parsing status.
type ParseStatus string

const (
	ParseStatusPending    ParseStatus = "PENDING"
	ParseStatusProcessing ParseStatus = "PROCESSING"
	ParseStatusDone       ParseStatus = "DONE"
	ParseStatusFailed     ParseStatus = "FAILED"
)

// TestType represents the type of test section.
type TestType string

const (
	TestTypeTechnical      TestType = "TECHNICAL"
	TestTypeReasoning      TestType = "REASONING"
	TestTypeProblemSolving TestType = "PROBLEM_SOLVING"
	TestTypePractical       TestType = "PRACTICAL"
)

// Difficulty level.
type Difficulty string

const (
	DifficultyEasy   Difficulty = "EASY"
	DifficultyMedium Difficulty = "MEDIUM"
	DifficultyHard   Difficulty = "HARD"
	DifficultyMixed  Difficulty = "MIXED"
)

// TestStatus defines state of the test.
type TestStatus string

const (
	TestStatusDraft    TestStatus = "DRAFT"
	TestStatusApproved TestStatus = "APPROVED"
	TestStatusArchived TestStatus = "ARCHIVED"
)

// QuestionType defines kind of question.
type QuestionType string

const (
	QuestionTypeMCQ       QuestionType = "MCQ"
	QuestionTypeOpenEnded QuestionType = "OPEN_ENDED"
	QuestionTypeCode      QuestionType = "CODE"
)

// GenerationStatus tracks AI generation workflow.
type GenerationStatus string

const (
	GenerationStatusIdle       GenerationStatus = "IDLE"
	GenerationStatusDrafting   GenerationStatus = "DRAFTING"
	GenerationStatusExtracting GenerationStatus = "EXTRACTING"
	GenerationStatusGenerating GenerationStatus = "GENERATING"
	GenerationStatusReady      GenerationStatus = "READY"
	GenerationStatusFailed     GenerationStatus = "FAILED"
)

// JdSource indicates origin of job description.
type JdSource string

const (
	JdSourceUploaded  JdSource = "UPLOADED"
	JdSourceGenerated JdSource = "GENERATED"
)

// InvitationStatus tracks candidate invitation lifecycle.
type InvitationStatus string

const (
	InvitationStatusPending    InvitationStatus = "PENDING"
	InvitationStatusOpened     InvitationStatus = "OPENED"
	InvitationStatusCompleted  InvitationStatus = "COMPLETED"
	InvitationStatusExpired    InvitationStatus = "EXPIRED"
	InvitationStatusRevoked    InvitationStatus = "REVOKED"
	InvitationStatusTerminated InvitationStatus = "TERMINATED"
)

// AttemptStatus tracks candidate test session state.
type AttemptStatus string

const (
	AttemptStatusNotStarted AttemptStatus = "NOT_STARTED"
	AttemptStatusInProgress AttemptStatus = "IN_PROGRESS"
	AttemptStatusSubmitted  AttemptStatus = "SUBMITTED"
	AttemptStatusEvaluated  AttemptStatus = "EVALUATED"
	AttemptStatusTerminated AttemptStatus = "TERMINATED"
)

// AIRecommendation recommendations.
type AIRecommendation string

const (
	AIRecommendationStrongHire AIRecommendation = "STRONG_HIRE"
	AIRecommendationHire       AIRecommendation = "HIRE"
	AIRecommendationMaybe      AIRecommendation = "MAYBE"
	AIRecommendationNoHire     AIRecommendation = "NO_HIRE"
)

// SignupStatus for user onboarding.
type SignupStatus string

const (
	SignupStatusPending  SignupStatus = "PENDING"
	SignupStatusApproved SignupStatus = "APPROVED"
	SignupStatusRejected SignupStatus = "REJECTED"
)
