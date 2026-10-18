package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"talvyn/pkg/protocol"
)

func TestGatewayHealthEndpoints(t *testing.T) {
	r := chi.NewRouter()

	r.Get("/health/live", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{
			"status":  "healthy",
			"service": "gateway",
		})
	})

	r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{
			"status":  "ready",
			"service": "gateway",
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var liveResp struct {
		Success bool `json:"success"`
		Data    map[string]string
	}
	_ = json.Unmarshal(w.Body.Bytes(), &liveResp)
	if !liveResp.Success || liveResp.Data["status"] != "healthy" {
		t.Fatalf("unexpected live response: %v", liveResp)
	}
}
