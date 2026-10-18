package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"talvyn-backend/internal/domain"
	"talvyn-backend/internal/service"
)

// AttemptHandler handles candidate assessment lifecycle HTTP endpoints.
type AttemptHandler struct {
	svc *service.AttemptService
}

// NewAttemptHandler creates a new AttemptHandler.
func NewAttemptHandler(svc *service.AttemptService) *AttemptHandler {
	return &AttemptHandler{svc: svc}
}

type startAttemptReq struct {
	Token     string `json:"token"`
	TestIndex int    `json:"test_index"`
}

// Start begins or resumes an assessment attempt from the magic link token.
func (h *AttemptHandler) Start(w http.ResponseWriter, r *http.Request) {
	var req startAttemptReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	ip := r.RemoteAddr
	resp, err := h.svc.StartAttempt(r.Context(), req.Token, req.TestIndex, &ip)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			http.Error(w, `{"error":"Invitation not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, domain.ErrUnauthorized) {
			http.Error(w, `{"error":"Invalid invitation token"}`, http.StatusUnauthorized)
			return
		}
		if errors.Is(err, domain.ErrTokenExpired) {
			http.Error(w, `{"error":"Invitation expired"}`, http.StatusGone)
			return
		}
		if errors.Is(err, domain.ErrForbidden) {
			http.Error(w, `{"error":"Invitation revoked or terminated"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

// GetState retrieves current attempt state and remaining time for page refresh resume.
func (h *AttemptHandler) GetState(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")
	token := GetAttemptToken(r.Context())

	resp, err := h.svc.GetAttemptState(r.Context(), attemptID, token)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			http.Error(w, `{"error":"Attempt not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, domain.ErrAttemptTerminated) {
			http.Error(w, `{"error":"Attempt terminated due to integrity violation"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

type saveAnswerReq struct {
	QuestionID     string  `json:"question_id"`
	SelectedOption *string `json:"selected_option"`
	AnswerText     *string `json:"answer_text"`
}

// SaveAnswer autosaves a question answer.
func (h *AttemptHandler) SaveAnswer(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	var req saveAnswerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if err := h.svc.SaveAnswer(r.Context(), attemptID, req.QuestionID, req.SelectedOption, req.AnswerText); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			http.Error(w, `{"error":"Attempt is not in progress"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"saved": true})
}

type heartbeatReq struct {
	ElapsedSeconds int `json:"elapsed_seconds"`
}

// Heartbeat syncs countdown timer with server clock.
func (h *AttemptHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	var req heartbeatReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	remaining, err := h.svc.Heartbeat(r.Context(), attemptID, req.ElapsedSeconds)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"time_remaining_seconds": remaining})
}

type eventReq struct {
	EventType string          `json:"event_type"`
	Metadata  json.RawMessage `json:"metadata"`
}

// LogEvent records anti-cheat telemetry and triggers progressive strikes.
func (h *AttemptHandler) LogEvent(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	var req eventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	count, terminated, err := h.svc.LogSuspiciousEvent(r.Context(), attemptID, req.EventType, req.Metadata)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"recorded":      true,
		"warning_count": count,
		"terminated":    terminated,
	})
}

// Submit finalizes the attempt.
func (h *AttemptHandler) Submit(w http.ResponseWriter, r *http.Request) {
	attemptID := chi.URLParam(r, "id")

	if err := h.svc.Submit(r.Context(), attemptID); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "SUBMITTED",
		"message": "Your assessment has been submitted successfully.",
	})
}
