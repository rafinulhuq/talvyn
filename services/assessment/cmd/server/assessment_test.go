package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestAssessmentEngineCockpitEndpoints(t *testing.T) {
	server := NewAssessmentServer(nil, nil)

	r := chi.NewRouter()
	r.Route("/api/v1/attempts", func(r chi.Router) {
		r.Get("/{id}/state", server.HandleGetState)
		r.Post("/{id}/answer", server.HandleAutosave)
		r.Post("/{id}/heartbeat", server.HandleHeartbeat)
		r.Post("/{id}/event", server.HandleTelemetryEvent)
		r.Post("/{id}/submit", server.HandleSubmit)
	})

	attemptID := "att_test_12345"

	// 1. Test Autosave
	answerPayload, _ := json.Marshal(map[string]any{
		"question_id": "q1",
		"answer_text": "func solution() { return true }",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/attempts/"+attemptID+"/answer", bytes.NewBuffer(answerPayload))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected autosave status 200, got %d", w.Code)
	}

	// 2. Test Heartbeat
	hbPayload, _ := json.Marshal(map[string]any{
		"elapsed_seconds": 120,
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/attempts/"+attemptID+"/heartbeat", bytes.NewBuffer(hbPayload))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected heartbeat status 200, got %d", w.Code)
	}

	var hbResp struct {
		Data struct {
			TimeRemainingSeconds int `json:"time_remaining_seconds"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &hbResp)
	if hbResp.Data.TimeRemainingSeconds != 3480 {
		t.Fatalf("expected 3480 remaining seconds, got %d", hbResp.Data.TimeRemainingSeconds)
	}

	// 3. Test Telemetry Event
	eventPayload, _ := json.Marshal(map[string]any{
		"event_type":       "TAB_BLUR",
		"client_timestamp": time.Now().UTC(),
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/attempts/"+attemptID+"/event", bytes.NewBuffer(eventPayload))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected telemetry status 200, got %d", w.Code)
	}

	// 4. Test Final Submit
	req = httptest.NewRequest(http.MethodPost, "/api/v1/attempts/"+attemptID+"/submit", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected submit status 200, got %d", w.Code)
	}
}
