package domain

import "time"

// Candidate represents a job applicant taking an assessment.
type Candidate struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	Name      string     `json:"name"`
	Phone     *string    `json:"phone,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`

	// Relational fields
	Invitations []Invitation  `json:"invitations,omitempty"`
	Attempts    []TestAttempt `json:"attempts,omitempty"`
}

// Invitation represents a magic link invitation sent to a candidate.
type Invitation struct {
	ID          string           `json:"id"`
	CandidateID string           `json:"candidate_id"`
	JdID        string           `json:"jd_id"`
	InvitedByID string           `json:"invited_by"`
	TokenHash   string           `json:"-"`
	ExpiresAt   time.Time        `json:"expires_at"`
	Status      InvitationStatus `json:"status"`
	EmailSentAt *time.Time       `json:"email_sent_at,omitempty"`
	CreatedAt   time.Time        `json:"created_at"`

	// Relational fields
	Candidate *Candidate      `json:"candidate,omitempty"`
	JD        *JobDescription `json:"job_description,omitempty"`
	InvitedBy *User           `json:"invited_by_user,omitempty"`
}

// IsExpired checks if invitation has passed expiration time.
func (i *Invitation) IsExpired() bool {
	return time.Now().After(i.ExpiresAt)
}
