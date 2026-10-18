package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"talvyn/pkg/protocol"
)

type Config struct {
	Port           string
	IAMURL         string
	RecruitmentURL string
	AssessmentURL  string
	EvaluationURL  string
	AnalyticsURL   string
}

func loadConfig() Config {
	port := getEnv("PORT", getEnv("GATEWAY_PORT", "8000"))
	return Config{
		Port:           port,
		IAMURL:         getEnv("IAM_SERVICE_URL", "http://localhost:8001"),
		RecruitmentURL: getEnv("RECRUITMENT_SERVICE_URL", "http://localhost:8002"),
		AssessmentURL:  getEnv("ASSESSMENT_SERVICE_URL", "http://localhost:8003"),
		EvaluationURL:  getEnv("EVALUATION_SERVICE_URL", "http://localhost:8004"),
		AnalyticsURL:   getEnv("ANALYTICS_SERVICE_URL", "http://localhost:8005"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// createProxy builds a reverse proxy for a target service URL with zero buffering for SSE.
func createProxy(targetURL string, serviceName string) http.Handler {
	target, err := url.Parse(targetURL)
	if err != nil {
		slog.Error("Invalid target URL", "service", serviceName, "url", targetURL, "error", err)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			protocol.WriteError(w, http.StatusBadGateway, "CONFIG_ERROR", "Invalid target URL configuration", err.Error())
		})
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host

		// Forward or retain Request ID
		reqID := chimw.GetReqID(req.Context())
		if reqID != "" {
			req.Header.Set("X-Request-Id", reqID)
		}
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("Downstream service proxy failed",
			"service", serviceName,
			"target", targetURL,
			"path", r.URL.Path,
			"error", err,
		)
		protocol.WriteError(w, http.StatusBadGateway, "SERVICE_UNAVAILABLE",
			"Target service '"+serviceName+"' is temporarily unreachable", err.Error())
	}

	// Flush immediately to support SSE and WebSocket streaming
	proxy.FlushInterval = 50 * time.Millisecond

	return proxy
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := loadConfig()
	slog.Info("Starting Talvyn API Gateway", "port", cfg.Port)

	r := chi.NewRouter()

	// Global Middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	// Cross-Origin Resource Sharing
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Internal-Token", "X-Actor-Id", "X-Attempt-Token", "X-Request-Id"},
		ExposedHeaders:   []string{"Link", "Content-Length", "X-Request-Id"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health Probes
	r.Get("/health/live", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]string{
			"status":  "healthy",
			"service": "gateway",
		})
	})

	r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		protocol.WriteJSON(w, http.StatusOK, map[string]any{
			"status":  "ready",
			"service": "gateway",
			"routes": map[string]string{
				"iam":         cfg.IAMURL,
				"recruitment": cfg.RecruitmentURL,
				"assessment":  cfg.AssessmentURL,
				"evaluation":  cfg.EvaluationURL,
				"analytics":   cfg.AnalyticsURL,
			},
		})
	})

	// Service Proxies
	iamProxy := createProxy(cfg.IAMURL, "iam")
	recruitmentProxy := createProxy(cfg.RecruitmentURL, "recruitment")
	assessmentProxy := createProxy(cfg.AssessmentURL, "assessment")
	evaluationProxy := createProxy(cfg.EvaluationURL, "evaluation")
	analyticsProxy := createProxy(cfg.AnalyticsURL, "analytics")

	// Mount Reverse Proxy Routes
	// 1. IAM Service (:8001): /api/v1/auth/* & /api/v1/users/*
	r.Mount("/api/v1/auth", iamProxy)
	r.Mount("/api/v1/users", iamProxy)

	// 2. Recruitment Service (:8002): /api/v1/jd/* & /api/v1/tests/*
	r.Mount("/api/v1/jd", recruitmentProxy)
	r.Mount("/api/v1/tests", recruitmentProxy)

	// 3. Assessment Engine (:8003): /api/v1/attempts/*
	r.Mount("/api/v1/attempts", assessmentProxy)

	// 4. Evaluation AI Service (:8004): /api/v1/evaluation/*
	r.Mount("/api/v1/evaluation", evaluationProxy)

	// 5. Analytics Service (:8005): /api/v1/leaderboard/*
	r.Mount("/api/v1/leaderboard", analyticsProxy)

	// Root fallback
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			protocol.WriteError(w, http.StatusNotFound, "ROUTE_NOT_FOUND", "Endpoint not registered on API gateway", r.URL.Path)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"platform": "Talvyn Microservices Gateway",
			"version":  "v1.0.0",
		})
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // 0 enables unbuffered SSE streaming across proxies
		IdleTimeout:  60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() {
		slog.Info("Gateway listening", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Gateway server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("Shutting down API Gateway gracefully...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("Gateway shutdown failed", "error", err)
	}

	slog.Info("API Gateway shutdown complete")
}
