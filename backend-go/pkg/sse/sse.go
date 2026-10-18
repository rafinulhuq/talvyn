package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Streamer wraps http.ResponseWriter to write Server-Sent Events.
type Streamer struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

// NewStreamer sets SSE headers and validates flusher support.
func NewStreamer(w http.ResponseWriter) (*Streamer, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("streaming unsupported: response writer is not an http.Flusher")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	return &Streamer{
		w:       w,
		flusher: flusher,
	}, nil
}

// SendEvent serializes payload to JSON and emits as standard SSE data.
func (s *Streamer) SendEvent(data any) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal sse payload: %w", err)
	}

	if _, err := fmt.Fprintf(s.w, "data: %s\n\n", payload); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

// SendNamedEvent sends an SSE event with explicit event type.
func (s *Streamer) SendNamedEvent(event string, data any) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal sse payload: %w", err)
	}

	if _, err := fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, payload); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

// Ping sends an SSE comment heartbeat to prevent gateway timeouts.
func (s *Streamer) Ping() error {
	if _, err := fmt.Fprintf(s.w, ": ping %d\n\n", time.Now().Unix()); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}
