package protocol

import (
	"encoding/json"
	"net/http"
	"time"
)

// Standard JSON response envelope.
type Response[T any] struct {
	Success   bool      `json:"success"`
	Data      T         `json:"data,omitempty"`
	Error     *APIError `json:"error,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// Structured error details.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

// WriteJSON sends a successful standardized JSON payload.
func WriteJSON[T any](w http.ResponseWriter, status int, data T) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response[T]{
		Success:   true,
		Data:      data,
		Timestamp: time.Now().UTC(),
	})
}

// WriteError sends a standardized error response.
func WriteError(w http.ResponseWriter, status int, code, message, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response[any]{
		Success: false,
		Error: &APIError{
			Code:    code,
			Message: message,
			Detail:  detail,
		},
		Timestamp: time.Now().UTC(),
	})
}
