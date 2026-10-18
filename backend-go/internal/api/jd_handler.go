package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"talvyn-backend/internal/domain"
	"talvyn-backend/internal/repository/postgres"
	"talvyn-backend/internal/service"
)

// JDHandler handles Job Description management and generation requests.
type JDHandler struct {
	repo  *postgres.Repository
	aiSvc *service.AIService
}

// NewJDHandler creates a new JDHandler.
func NewJDHandler(repo *postgres.Repository, aiSvc *service.AIService) *JDHandler {
	return &JDHandler{repo: repo, aiSvc: aiSvc}
}

type generateJdReq struct {
	JobTitle string `json:"job_title"`
	RawText  string `json:"raw_text"`
}

// Generate creates a JD entity and kicks off the async generation pipeline.
func (h *JDHandler) Generate(w http.ResponseWriter, r *http.Request) {
	actor := GetActor(r.Context())
	uploadedBy := "system"
	if actor != nil {
		uploadedBy = actor.ID
	}

	var req generateJdReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	jd := &domain.JobDescription{
		ID:               uuid.New().String(),
		UploadedByID:     uploadedBy,
		Source:           domain.JdSourceGenerated,
		OriginalFilename: req.JobTitle,
		RawText:          &req.RawText,
		ParseStatus:      domain.ParseStatusDone,
		GenerationStatus: domain.GenerationStatusGenerating,
	}

	if err := h.repo.CreateJd(r.Context(), jd); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Trigger async generation
	h.aiSvc.TriggerGeneration(r.Context(), jd.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jd_id":             jd.ID,
		"generation_status": jd.GenerationStatus,
	})
}

// GetByID returns job description details scoped to actor permissions.
func (h *JDHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := GetActor(r.Context())

	var ownerID *string
	if actor != nil {
		ownerID = actor.OwnerScope()
	}

	jd, err := h.repo.GetJdByID(r.Context(), id, ownerID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			http.Error(w, `{"error":"Job description not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(jd)
}

// List returns job descriptions scoped to actor permissions.
func (h *JDHandler) List(w http.ResponseWriter, r *http.Request) {
	actor := GetActor(r.Context())

	var ownerID *string
	if actor != nil {
		ownerID = actor.OwnerScope()
	}

	limit := 20
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if val, err := strconv.Atoi(o); err == nil && val >= 0 {
			offset = val
		}
	}

	jds, err := h.repo.ListJds(r.Context(), ownerID, limit, offset)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(jds)
}
