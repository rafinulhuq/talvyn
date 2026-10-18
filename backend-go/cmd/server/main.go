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

	"talvyn-backend/internal/api"
	"talvyn-backend/internal/config"
	"talvyn-backend/internal/repository/postgres"
	"talvyn-backend/internal/service"
	"talvyn-backend/pkg/worker"
)

func main() {
	// Configure structured JSON logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("Starting Talvyn Go Engine", "version", "1.0.0", "go_runtime", "go1.23+")

	// Load configuration
	cfg := config.Load()
	slog.Info("Configuration loaded", "port", cfg.Port, "environment", cfg.Environment)

	// Context for application lifecycle
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	// Initialize PostgreSQL pool
	pool, err := postgres.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("Database connection failed", "error", err)
		// For resiliency in development or container readiness wait, log and continue or exit
		// If running in cluster, readiness probe will mark unready
	}
	if pool != nil {
		defer pool.Close()
	}

	// Initialize repositories
	repo := postgres.NewRepository(pool)

	// Initialize worker pool
	workerPool := worker.NewPool(8, 1000)
	defer workerPool.Stop()

	// Initialize services
	attemptSvc := service.NewAttemptService(repo, cfg.AppSecret)
	aiSvc := service.NewAIService(repo)

	// Initialize handlers
	healthHandler := api.NewHealthHandler(pool)
	attemptHandler := api.NewAttemptHandler(attemptSvc)
	jdHandler := api.NewJDHandler(repo, aiSvc)
	sseHandler := api.NewSSEHandler(aiSvc)

	// Initialize router
	router := api.SetupRouter(cfg, repo, healthHandler, attemptHandler, jdHandler, sseHandler)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		// WriteTimeout is disabled (0) to permit long-lived SSE streaming connections
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	// Start HTTP listener in background goroutine
	go func() {
		slog.Info("Talvyn Go HTTP server listening", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("HTTP server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for termination signal
	<-ctx.Done()
	slog.Info("Shutdown signal received, draining active connections...")

	// Graceful shutdown with 10s deadline
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("Forced server shutdown", "error", err)
	}

	slog.Info("Talvyn Go Engine successfully stopped")
}
