package domain

import "time"

// User represents an administrative user or recruiter in Talvyn.
type User struct {
	ID                     string       `json:"id"`
	Email                  string       `json:"email"`
	Name                   string       `json:"name"`
	PasswordHash           string       `json:"-"`
	PasswordResetTokenHash *string      `json:"-"`
	PasswordResetExpiresAt *time.Time   `json:"-"`
	SessionVersion         int          `json:"session_version"`
	Role                   Role         `json:"role"`
	IsActive               bool         `json:"is_active"`
	CompanyName            *string      `json:"company_name,omitempty"`
	SignupStatus           SignupStatus `json:"signup_status"`
	Username               *string      `json:"username,omitempty"`
	RoleInCompany          *string      `json:"role_in_company,omitempty"`
	CompanyWebsite         *string      `json:"company_website,omitempty"`
	PhoneNumber            *string      `json:"phone_number,omitempty"`
	CreatedAt              time.Time    `json:"created_at"`
	UpdatedAt              time.Time    `json:"updated_at"`
	DeletedAt              *time.Time   `json:"deleted_at,omitempty"`
}

// HasMinRole checks whether user privilege meets or exceeds required role.
func (u *User) HasMinRole(min Role) bool {
	return RoleRank[u.Role] >= RoleRank[min]
}

// OwnerScope returns owner ID filter string, or empty if user has org-wide privileges (ADMIN+).
func (u *User) OwnerScope() *string {
	if RoleRank[u.Role] < RoleRank[RoleAdmin] {
		return &u.ID
	}
	return nil
}
