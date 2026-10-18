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
		port = os.Getenv("ANALYTICS_PORT")
	}
	if port == "" {
		port = "8005"
	}

	slog.Info("Starting Analytics & Leaderboard Service", "port", port)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health/live", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{"status": "healthy", "service": "analytics-service"})
	})
	r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": "analytics-service"})
	})

	r.Route("/api/v1/leaderboard", func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			protocol.WriteJSON(w, http.StatusOK, map[string]any{
				"total_candidates": 0,
				"rankings":         []any{},
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
		slog.Info("Analytics service listening", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Analytics server error", "error", err)
			os.Exit(1)
		}
	}()

	<-sigCtx.Done()
	slog.Info("Shutting down Analytics Service...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
