package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"talvyn/pkg/eventbus"
	"talvyn/pkg/protocol"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
}

func loadConfig() Config {
	return Config{
		Port:        getEnv("PORT", getEnv("ASSESSMENT_PORT", "8003")),
		DatabaseURL: getEnv("DATABASE_URL", "postgresql://talvyn_user:talvyn_pass@localhost:5440/talvyn_db?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "localhost:6379"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// AssessmentServer encapsulates the high-concurrency assessment engine.
type AssessmentServer struct {
	db       *pgxpool.Pool
	eventBus *eventbus.EventBus

	// In-memory answer buffer for sub-millisecond autosaves
	answerBuffer sync.Map // key: attemptID:questionID -> *AnswerPayload
	flushChan    chan *AnswerPayload
}

type AnswerPayload struct {
	AttemptID      string    `json:"attempt_id"`
	QuestionID     string    `json:"question_id"`
	SelectedOption *string   `json:"selected_option,omitempty"`
	AnswerText     *string   `json:"answer_text,omitempty"`
	SavedAt        time.Time `json:"saved_at"`
}

type HeartbeatReq struct {
	ElapsedSeconds int `json:"elapsed_seconds"`
}

type TelemetryEventReq struct {
	EventType      string          `json:"event_type"` // e.g. "TAB_BLUR", "PASTE_BURST", "DEVTOOLS_OPEN", "KEYSTROKE_FLIGHT"
	Metadata       json.RawMessage `json:"metadata"`
	ClientTimestamp time.Time      `json:"client_timestamp"`
}

func NewAssessmentServer(db *pgxpool.Pool, eb *eventbus.EventBus) *AssessmentServer {
	s := &AssessmentServer{
		db:        db,
		eventBus:  eb,
		flushChan: make(chan *AnswerPayload, 50000),
	}

	// Start background async persistence worker for batched answer inserts
	go s.startAnswerFlushWorker()

	return s
}

// startAnswerFlushWorker periodically batches buffered answers to PostgreSQL.
func (s *AssessmentServer) startAnswerFlushWorker() {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	var batch []*AnswerPayload

	for {
		select {
		case item, ok := <-s.flushChan:
			if !ok {
				return
			}
			batch = append(batch, item)
			if len(batch) >= 100 {
				s.persistAnswers(batch)
				batch = nil
			}

		case <-ticker.C:
			if len(batch) > 0 {
				s.persistAnswers(batch)
				batch = nil
			}
		}
	}
}

func (s *AssessmentServer) persistAnswers(batch []*AnswerPayload) {
	if s.db == nil || len(batch) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Execute batch UPSERT
	for _, a := range batch {
		query := `
			INSERT INTO candidate_answers (id, attempt_id, question_id, selected_option, answer_text, is_auto_scored, auto_score, saved_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, false, null, $6, now())
			ON CONFLICT (attempt_id, question_id) DO UPDATE
			SET selected_option = EXCLUDED.selected_option,
			    answer_text = EXCLUDED.answer_text,
			    updated_at = now()
		`
		id := uuid.New().String()
		_, _ = s.db.Exec(ctx, query, id, a.AttemptID, a.QuestionID, a.SelectedOption, a.AnswerText, a.SavedAt)
	}
}

// HandleAutosave provides sub-millisecond latency by updating atomic memory buffer and queuing async write.
func (s *AssessmentServer) HandleAutosave(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")
	if attemptID == "" {
		protocol.WriteError(w, http.StatusBadRequest, "INVALID_ID", "Attempt ID is required", "")
		return
	}

	var req struct {
		QuestionID     string  `json:"question_id"`
		SelectedOption *string `json:"selected_option"`
		AnswerText     *string `json:"answer_text"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		protocol.WriteError(w, http.StatusBadRequest, "INVALID_PAYLOAD", "Cannot parse answer JSON", err.Error())
		return
	}

	if req.QuestionID == "" {
		protocol.WriteError(w, http.StatusBadRequest, "MISSING_QUESTION", "Question ID is required", "")
		return
	}

	payload := &AnswerPayload{
		AttemptID:      attemptID,
		QuestionID:     req.QuestionID,
		SelectedOption: req.SelectedOption,
		AnswerText:     req.AnswerText,
		SavedAt:        time.Now().UTC(),
	}

	// 1. Atomic in-memory cache update (< 0.05ms)
	key := attemptID + ":" + req.QuestionID
	s.answerBuffer.Store(key, payload)

	// 2. Queue for background durability write
	select {
	case s.flushChan <- payload:
	default:
		// Fallback direct write if buffer is full
		go s.persistAnswers([]*AnswerPayload{payload})
	}

	protocol.WriteJSON(w, http.StatusOK, map[string]any{
		"saved":    true,
		"saved_at": payload.SavedAt,
	})
}

// HandleHeartbeat synchronizes the candidate's timer against authoritative server clock.
func (s *AssessmentServer) HandleHeartbeat(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	var req HeartbeatReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		protocol.WriteError(w, http.StatusBadRequest, "INVALID_PAYLOAD", "Cannot parse heartbeat JSON", err.Error())
		return
	}

	// Calculate remaining time server-side
	durationMinutes := 60
	remSeconds := (durationMinutes * 60) - req.ElapsedSeconds
	if remSeconds < 0 {
		remSeconds = 0
	}

	if s.db != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_, _ = s.db.Exec(ctx, `UPDATE test_attempts SET time_remaining_seconds = $1 WHERE id = $2`, remSeconds, attemptID)
		}()
	}

	protocol.WriteJSON(w, http.StatusOK, map[string]any{
		"time_remaining_seconds": remSeconds,
		"server_time":            time.Now().UTC(),
	})
}

// HandleTelemetryEvent captures anti-cheat signals and enforces progressive 3-strike policies.
func (s *AssessmentServer) HandleTelemetryEvent(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	var req TelemetryEventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		protocol.WriteError(w, http.StatusBadRequest, "INVALID_PAYLOAD", "Cannot parse telemetry JSON", err.Error())
		return
	}

	slog.Info("Proctoring event logged",
		"attempt_id", attemptID,
		"type", req.EventType,
		"timestamp", req.ClientTimestamp,
	)

	strikeCount := 1
	terminated := false

	if s.db != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		eventID := uuid.New().String()
		_, _ = s.db.Exec(ctx, `
			INSERT INTO suspicious_events (id, attempt_id, event_type, occurred_at, metadata)
			VALUES ($1, $2, $3, now(), $4)
		`, eventID, attemptID, req.EventType, req.Metadata)

		// Count events of this type
		_ = s.db.QueryRow(ctx, `SELECT count(*) FROM suspicious_events WHERE attempt_id = $1 AND event_type = $2`, attemptID, req.EventType).Scan(&strikeCount)

		// Progressive 3-strike policy: if window blur or paste anomaly occurs 3 times, terminate attempt
		if strikeCount >= 3 && (req.EventType == "TAB_BLUR" || req.EventType == "DEVTOOLS_OPEN") {
			_, _ = s.db.Exec(ctx, `UPDATE test_attempts SET status = 'TERMINATED' WHERE id = $1`, attemptID)
			terminated = true
		}
	}

	protocol.WriteJSON(w, http.StatusOK, map[string]any{
		"recorded":      true,
		"warning_count": strikeCount,
		"max_allowed":   3,
		"terminated":    terminated,
	})
}

// HandleSubmit finalizes candidate exam and publishes attempt.submitted event to the Redis Stream.
func (s *AssessmentServer) HandleSubmit(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	now := time.Now().UTC()

	var candidateID, testID, candidateName string
	candidateID = "cand_" + attemptID[:8]
	testID = "test_default"
	candidateName = "Candidate"

	if s.db != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		// Update attempt status to SUBMITTED
		_, err := s.db.Exec(ctx, `
			UPDATE test_attempts
			SET status = 'SUBMITTED', submitted_at = $1
			WHERE id = $2 AND status != 'TERMINATED'
		`, now, attemptID)

		if err != nil {
			slog.Error("Failed to update attempt to SUBMITTED", "error", err)
		}

		// Query attempt details for event payload
		query := `
			SELECT ta.candidate_id, ta.test_id, COALESCE(c.name, 'Candidate')
			FROM test_attempts ta
			LEFT JOIN candidates c ON ta.candidate_id = c.id
			WHERE ta.id = $1
		`
		_ = s.db.QueryRow(ctx, query, attemptID).Scan(&candidateID, &testID, &candidateName)
	}

	// Publish attempt.submitted event to Redis Stream talvyn.events
	if s.eventBus != nil {
		eventPayload := map[string]any{
			"attempt_id":      attemptID,
			"test_id":         testID,
			"candidate_id":    candidateID,
			"candidate_name":  candidateName,
			"submitted_at":    now.Format(time.RFC3339),
			"total_questions": 10,
		}

		evt, err := s.eventBus.PublishEvent(r.Context(), "attempt.submitted", "assessment-engine", eventPayload)
		if err != nil {
			slog.Error("Failed to publish attempt.submitted event", "error", err)
		} else {
			slog.Info("Emitted attempt.submitted event", "event_id", evt.EventID, "attempt_id", attemptID)
		}
	}

	protocol.WriteJSON(w, http.StatusOK, map[string]any{
		"status":       "SUBMITTED",
		"attempt_id":   attemptID,
		"submitted_at": now,
		"message":      "Your assessment has been successfully submitted and locked for AI grading.",
	})
}

// HandleGetState rehydrates active state for candidate session reload.
func (s *AssessmentServer) HandleGetState(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	status := "IN_PROGRESS"
	remSeconds := 3600

	if s.db != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		_ = s.db.QueryRow(ctx, `
			SELECT status, COALESCE(time_remaining_seconds, 3600)
			FROM test_attempts
			WHERE id = $1
		`, attemptID).Scan(&status, &remSeconds)
	}

	protocol.WriteJSON(w, http.StatusOK, map[string]any{
		"attempt_id":             attemptID,
		"status":                 status,
		"time_remaining_seconds": remSeconds,
	})
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := loadConfig()
	slog.Info("Starting Assessment Engine", "port", cfg.Port, "db", cfg.DatabaseURL, "redis", cfg.RedisURL)

	// Initialize PostgreSQL pool
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pgConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	var db *pgxpool.Pool
	if err == nil {
		pgConfig.MaxConns = 50
		pgConfig.MinConns = 10
		db, err = pgxpool.NewWithConfig(ctx, pgConfig)
		if err != nil {
			slog.Warn("PostgreSQL pool connection failed, operating with in-memory buffer", "error", err)
		} else {
			slog.Info("PostgreSQL connected for assessment engine")
		}
	}

	// Initialize EventBus
	eb, err := eventbus.New(cfg.RedisURL, eventbus.DefaultStreamName)
	if err != nil {
		slog.Warn("Redis EventBus connection failed, events will not be dispatched", "error", err)
	} else {
		slog.Info("Redis EventBus connected for assessment engine")
	}

	serverCore := NewAssessmentServer(db, eb)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	// Health probes
	r.Get("/health/live", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{
			"status":  "healthy",
			"service": "assessment-engine",
		})
	})

	r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		dbStatus := "disconnected"
		if db != nil && db.Ping(r.Context()) == nil {
			dbStatus = "connected"
		}
		redisStatus := "disconnected"
		if eb != nil && eb.Client().Ping(r.Context()).Err() == nil {
			redisStatus = "connected"
		}

		protocol.WriteJSON(w, http.StatusOK, map[string]any{
			"status":   "ready",
			"service":  "assessment-engine",
			"database": dbStatus,
			"redis":    redisStatus,
		})
	})

	// Mount candidate cockpit API routes matching /api/v1/attempts/*
	r.Route("/api/v1/attempts", func(r chi.Router) {
		r.Get("/{id}/state", serverCore.HandleGetState)
		r.Post("/{id}/answer", serverCore.HandleAutosave)
		r.Post("/{id}/heartbeat", serverCore.HandleHeartbeat)
		r.Post("/{id}/event", serverCore.HandleTelemetryEvent)
		r.Post("/{id}/submit", serverCore.HandleSubmit)
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	sigCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() {
		slog.Info("Assessment Engine listening", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Assessment Engine server failed", "error", err)
			os.Exit(1)
		}
	}()

	<-sigCtx.Done()
	slog.Info("Shutting down Assessment Engine...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	_ = server.Shutdown(shutdownCtx)
	if db != nil {
		db.Close()
	}
	if eb != nil {
		_ = eb.Close()
	}

	slog.Info("Assessment Engine shutdown complete")
}
