package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"talvyn-backend/internal/service"
	"talvyn-backend/pkg/sse"
)

// SSEHandler handles Server-Sent Events endpoints for real-time progress.
type SSEHandler struct {
	aiSvc *service.AIService
}

// NewSSEHandler creates a new SSEHandler.
func NewSSEHandler(aiSvc *service.AIService) *SSEHandler {
	return &SSEHandler{aiSvc: aiSvc}
}

// StreamProgress streams generation progress events for a given JD until pct >= 100 or client disconnects.
// Corresponds to GET /api/v1/tests/progress/{jd_id}/stream.
func (h *SSEHandler) StreamProgress(w http.ResponseWriter, r *http.Request) {
	jdID := chi.URLParam(r, "jd_id")
	if jdID == "" {
		http.Error(w, `{"error":"Missing jd_id parameter"}`, http.StatusBadRequest)
		return
	}

	streamer, err := sse.NewStreamer(w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ch := h.aiSvc.Subscribe(jdID)
	defer h.aiSvc.Unsubscribe(jdID, ch)

	// Send initial event
	_ = streamer.SendEvent(service.ProgressSnapshot{
		Step:   "CONNECTED",
		Pct:    5,
		Detail: "Streaming progress connection established",
	})

	pingTicker := time.NewTicker(15 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case <-r.Context().Done():
			slog.Info("SSE client disconnected", "jd_id", jdID)
			return

		case <-pingTicker.C:
			if err := streamer.Ping(); err != nil {
				return
			}

		case snapshot, ok := <-ch:
			if !ok {
				return
			}
			if err := streamer.SendEvent(snapshot); err != nil {
				return
			}
			if snapshot.Pct >= 100 {
				return
			}
		}
	}
}
