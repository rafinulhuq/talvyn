package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"talvyn-backend/internal/domain"
)

// Repository encapsulates database access for all domain entities.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new PostgreSQL repository instance.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// ── User Repository ──────────────────────────────────────────

func (r *Repository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	query := `
		SELECT id, email, name, password_hash, session_version, role, is_active,
		       company_name, signup_status, username, role_in_company, company_website,
		       phone_number, created_at, updated_at, deleted_at
		FROM users
		WHERE id = $1 AND deleted_at IS NULL
	`
	row := r.pool.QueryRow(ctx, query, id)
	var u domain.User
	err := row.Scan(
		&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.SessionVersion, &u.Role, &u.IsActive,
		&u.CompanyName, &u.SignupStatus, &u.Username, &u.RoleInCompany, &u.CompanyWebsite,
		&u.PhoneNumber, &u.CreatedAt, &u.UpdatedAt, &u.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to query user by id: %w", err)
	}
	return &u, nil
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
		SELECT id, email, name, password_hash, session_version, role, is_active,
		       company_name, signup_status, username, role_in_company, company_website,
		       phone_number, created_at, updated_at, deleted_at
		FROM users
		WHERE email = $1 AND deleted_at IS NULL
	`
	row := r.pool.QueryRow(ctx, query, email)
	var u domain.User
	err := row.Scan(
		&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.SessionVersion, &u.Role, &u.IsActive,
		&u.CompanyName, &u.SignupStatus, &u.Username, &u.RoleInCompany, &u.CompanyWebsite,
		&u.PhoneNumber, &u.CreatedAt, &u.UpdatedAt, &u.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to query user by email: %w", err)
	}
	return &u, nil
}

func (r *Repository) Create(ctx context.Context, u *domain.User) error {
	query := `
		INSERT INTO users (id, email, name, password_hash, role, is_active, company_name, signup_status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	_, err := r.pool.Exec(ctx, query, u.ID, u.Email, u.Name, u.PasswordHash, u.Role, u.IsActive, u.CompanyName, u.SignupStatus, now, now)
	return err
}

func (r *Repository) Update(ctx context.Context, u *domain.User) error {
	query := `
		UPDATE users
		SET name = $2, role = $3, is_active = $4, company_name = $5, updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, u.ID, u.Name, u.Role, u.IsActive, u.CompanyName)
	return err
}

// ── Job Description Repository ───────────────────────────────

func (r *Repository) GetJdByID(ctx context.Context, id string, ownerID *string) (*domain.JobDescription, error) {
	query := `
		SELECT id, uploaded_by, source, original_filename, file_path, file_type, raw_text,
		       parse_status, generation_status, generation_input_json, created_at, updated_at, deleted_at
		FROM job_descriptions
		WHERE id = $1 AND deleted_at IS NULL
	`
	args := []any{id}
	if ownerID != nil {
		query += " AND uploaded_by = $2"
		args = append(args, *ownerID)
	}

	row := r.pool.QueryRow(ctx, query, args...)
	var jd domain.JobDescription
	err := row.Scan(
		&jd.ID, &jd.UploadedByID, &jd.Source, &jd.OriginalFilename, &jd.FilePath,
		&jd.FileType, &jd.RawText, &jd.ParseStatus, &jd.GenerationStatus,
		&jd.GenerationInputJSON, &jd.CreatedAt, &jd.UpdatedAt, &jd.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to query jd: %w", err)
	}
	return &jd, nil
}

func (r *Repository) ListJds(ctx context.Context, ownerID *string, limit, offset int) ([]domain.JobDescription, error) {
	query := `
		SELECT id, uploaded_by, source, original_filename, file_path, file_type, raw_text,
		       parse_status, generation_status, generation_input_json, created_at, updated_at, deleted_at
		FROM job_descriptions
		WHERE deleted_at IS NULL
	`
	args := []any{}
	if ownerID != nil {
		query += " AND uploaded_by = $1"
		args = append(args, *ownerID)
		query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	} else {
		query += " ORDER BY created_at DESC LIMIT $1 OFFSET $2"
	}
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list jds: %w", err)
	}
	defer rows.Close()

	var jds []domain.JobDescription
	for rows.Next() {
		var jd domain.JobDescription
		if err := rows.Scan(
			&jd.ID, &jd.UploadedByID, &jd.Source, &jd.OriginalFilename, &jd.FilePath,
			&jd.FileType, &jd.RawText, &jd.ParseStatus, &jd.GenerationStatus,
			&jd.GenerationInputJSON, &jd.CreatedAt, &jd.UpdatedAt, &jd.DeletedAt,
		); err != nil {
			return nil, err
		}
		jds = append(jds, jd)
	}
	return jds, nil
}

func (r *Repository) CreateJd(ctx context.Context, jd *domain.JobDescription) error {
	query := `
		INSERT INTO job_descriptions (id, uploaded_by, source, original_filename, file_path, file_type, raw_text, parse_status, generation_status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
	`
	_, err := r.pool.Exec(ctx, query, jd.ID, jd.UploadedByID, jd.Source, jd.OriginalFilename, jd.FilePath, jd.FileType, jd.RawText, jd.ParseStatus, jd.GenerationStatus)
	return err
}

func (r *Repository) UpdateJdStatus(ctx context.Context, id string, status domain.GenerationStatus) error {
	query := `UPDATE job_descriptions SET generation_status = $2, updated_at = now() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, status)
	return err
}

// ── Test & Question Repository ───────────────────────────────

func (r *Repository) GetTestByID(ctx context.Context, id string) (*domain.Test, error) {
	query := `
		SELECT id, jd_id, test_type, title, description, duration_minutes, total_marks,
		       passing_marks, difficulty, status, created_at, updated_at, deleted_at
		FROM tests
		WHERE id = $1 AND deleted_at IS NULL
	`
	row := r.pool.QueryRow(ctx, query, id)
	var t domain.Test
	err := row.Scan(
		&t.ID, &t.JdID, &t.TestType, &t.Title, &t.Description, &t.DurationMinutes,
		&t.TotalMarks, &t.PassingMarks, &t.Difficulty, &t.Status, &t.CreatedAt,
		&t.UpdatedAt, &t.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

func (r *Repository) GetQuestionsByTestID(ctx context.Context, testID string) ([]domain.Question, error) {
	query := `
		SELECT id, test_id, question_type, question_text, skill_tested, difficulty,
		       marks, order_index, options, correct_answer, explanation, expected_answer,
		       scoring_rubric, code_language, code_starter, created_at, updated_at
		FROM questions
		WHERE test_id = $1
		ORDER BY order_index ASC
	`
	rows, err := r.pool.Query(ctx, query, testID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var questions []domain.Question
	for rows.Next() {
		var q domain.Question
		if err := rows.Scan(
			&q.ID, &q.TestID, &q.QuestionType, &q.QuestionText, &q.SkillTested, &q.Difficulty,
			&q.Marks, &q.OrderIndex, &q.Options, &q.CorrectAnswer, &q.Explanation,
			&q.ExpectedAnswer, &q.ScoringRubric, &q.CodeLanguage, &q.CodeStarter,
			&q.CreatedAt, &q.UpdatedAt,
		); err != nil {
			return nil, err
		}
		questions = append(questions, q)
	}
	return questions, nil
}

// ── Candidate & Invitation Repository ────────────────────────

func (r *Repository) GetInvitationByTokenHash(ctx context.Context, tokenHash string) (*domain.Invitation, error) {
	query := `
		SELECT id, candidate_id, jd_id, invited_by, token_hash, expires_at, status, email_sent_at, created_at
		FROM invitations
		WHERE token_hash = $1
	`
	row := r.pool.QueryRow(ctx, query, tokenHash)
	var inv domain.Invitation
	err := row.Scan(
		&inv.ID, &inv.CandidateID, &inv.JdID, &inv.InvitedByID, &inv.TokenHash,
		&inv.ExpiresAt, &inv.Status, &inv.EmailSentAt, &inv.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &inv, nil
}

// ── Attempt & Answer Repository ──────────────────────────────

func (r *Repository) GetAttemptByID(ctx context.Context, id string) (*domain.TestAttempt, error) {
	query := `
		SELECT id, invitation_id, candidate_id, test_id, started_at, submitted_at,
		       time_remaining_seconds, status, ip_address, auto_submitted
		FROM test_attempts
		WHERE id = $1
	`
	row := r.pool.QueryRow(ctx, query, id)
	var att domain.TestAttempt
	err := row.Scan(
		&att.ID, &att.InvitationID, &att.CandidateID, &att.TestID, &att.StartedAt,
		&att.SubmittedAt, &att.TimeRemainingSeconds, &att.Status, &att.IPAddress,
		&att.AutoSubmitted,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &att, nil
}

func (r *Repository) CreateAttempt(ctx context.Context, att *domain.TestAttempt) error {
	query := `
		INSERT INTO test_attempts (id, invitation_id, candidate_id, test_id, started_at, time_remaining_seconds, status, ip_address, auto_submitted)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.pool.Exec(ctx, query, att.ID, att.InvitationID, att.CandidateID, att.TestID, att.StartedAt, att.TimeRemainingSeconds, att.Status, att.IPAddress, att.AutoSubmitted)
	return err
}

func (r *Repository) UpdateAttempt(ctx context.Context, att *domain.TestAttempt) error {
	query := `
		UPDATE test_attempts
		SET submitted_at = $2, time_remaining_seconds = $3, status = $4, auto_submitted = $5
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, att.ID, att.SubmittedAt, att.TimeRemainingSeconds, att.Status, att.AutoSubmitted)
	return err
}

func (r *Repository) SaveAnswer(ctx context.Context, a *domain.CandidateAnswer) error {
	query := `
		INSERT INTO candidate_answers (id, attempt_id, question_id, selected_option, answer_text, is_auto_scored, auto_score, saved_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
		ON CONFLICT (attempt_id, question_id) DO UPDATE
		SET selected_option = EXCLUDED.selected_option,
		    answer_text = EXCLUDED.answer_text,
		    updated_at = now()
	`
	_, err := r.pool.Exec(ctx, query, a.ID, a.AttemptID, a.QuestionID, a.SelectedOption, a.AnswerText, a.IsAutoScored, a.AutoScore)
	return err
}

func (r *Repository) GetAnswers(ctx context.Context, attemptID string) ([]domain.CandidateAnswer, error) {
	query := `
		SELECT id, attempt_id, question_id, selected_option, answer_text, is_auto_scored, auto_score, saved_at, updated_at
		FROM candidate_answers
		WHERE attempt_id = $1
	`
	rows, err := r.pool.Query(ctx, query, attemptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var answers []domain.CandidateAnswer
	for rows.Next() {
		var a domain.CandidateAnswer
		if err := rows.Scan(
			&a.ID, &a.AttemptID, &a.QuestionID, &a.SelectedOption, &a.AnswerText,
			&a.IsAutoScored, &a.AutoScore, &a.SavedAt, &a.UpdatedAt,
		); err != nil {
			return nil, err
		}
		answers = append(answers, a)
	}
	return answers, nil
}

func (r *Repository) LogSuspiciousEvent(ctx context.Context, e *domain.SuspiciousEvent) error {
	query := `
		INSERT INTO suspicious_events (id, attempt_id, event_type, occurred_at, metadata)
		VALUES ($1, $2, $3, now(), $4)
	`
	_, err := r.pool.Exec(ctx, query, e.ID, e.AttemptID, e.EventType, e.Metadata)
	return err
}

func (r *Repository) CountSuspiciousEvents(ctx context.Context, attemptID string, eventType string) (int, error) {
	query := `SELECT count(*) FROM suspicious_events WHERE attempt_id = $1 AND event_type = $2`
	var count int
	err := r.pool.QueryRow(ctx, query, attemptID, eventType).Scan(&count)
	return count, err
}
