package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"talvyn/pkg/protocol"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("IAM_PORT")
	}
	if port == "" {
		port = "8001"
	}

	slog.Info("Starting IAM & Auth Service", "port", port)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health/live", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{"status": "healthy", "service": "iam-service"})
	})
	r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": "iam-service"})
	})

	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Post("/login", func(w http.ResponseWriter, r *http.Request) {
			protocol.WriteJSON(w, http.StatusOK, map[string]any{
				"token": "iam_jwt_sample_token",
				"role":  "ADMIN",
			})
		})
	})

	r.Route("/api/v1/users", func(r chi.Router) {
		r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
			protocol.WriteJSON(w, http.StatusOK, map[string]any{
				"id":    "user_root_admin",
				"email": "admin@talvyn.internal",
				"role":  "ADMIN",
			})
		})
	})

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	sigCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() {
		slog.Info("IAM service listening", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("IAM server error", "error", err)
			os.Exit(1)
		}
	}()

	<-sigCtx.Done()
	slog.Info("Shutting down IAM Service...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
