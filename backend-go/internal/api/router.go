package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"talvyn-backend/internal/config"
	"talvyn-backend/internal/domain"
	"talvyn-backend/internal/repository/postgres"
)

// SetupRouter configures all HTTP middleware and routes.
func SetupRouter(
	cfg *config.Config,
	repo *postgres.Repository,
	healthHandler *HealthHandler,
	attemptHandler *AttemptHandler,
	jdHandler *JDHandler,
	sseHandler *SSEHandler,
) http.Handler {
	r := chi.NewRouter()

	// Base middleware stack
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(LoggerMiddleware)
	r.Use(chimw.Recoverer)

	// Cross-Origin Resource Sharing
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Internal-Token", "X-Actor-Id", "X-Attempt-Token"},
		ExposedHeaders:   []string{"Link", "Content-Length"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health probes
	r.Get("/health/live", healthHandler.Live)
	r.Get("/health/ready", healthHandler.Ready)

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		// Public & candidate cockpit attempt endpoints
		r.Route("/attempts", func(r chi.Router) {
			r.Post("/start", attemptHandler.Start)

			r.Group(func(r chi.Router) {
				r.Use(VerifyAttemptToken)
				r.Get("/{id}/state", attemptHandler.GetState)
				r.Post("/{id}/answer", attemptHandler.SaveAnswer)
				r.Post("/{id}/heartbeat", attemptHandler.Heartbeat)
				r.Post("/{id}/event", attemptHandler.LogEvent)
				r.Post("/{id}/submit", attemptHandler.Submit)
			})
		})

		// Recruiter & Job Description endpoints (protected by X-Internal-Token & Actor Scoping)
		r.Route("/jd", func(r chi.Router) {
			r.Use(VerifyInternalToken(cfg.InternalAPISecret))
			r.Use(ActorMiddleware(repo))

			r.Post("/generate", jdHandler.Generate)
			r.Get("/{id}", jdHandler.GetByID)
			r.Get("/", jdHandler.List)
		})

		// Test Generation & SSE streaming
		r.Route("/tests", func(r chi.Router) {
			r.Get("/progress/{jd_id}/stream", sseHandler.StreamProgress)
		})

		// Admin only endpoints (example of role gating)
		r.Route("/admin", func(r chi.Router) {
			r.Use(VerifyInternalToken(cfg.InternalAPISecret))
			r.Use(ActorMiddleware(repo))
			r.Use(RequireMinRole(domain.RoleAdmin))

			r.Get("/ping", func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"admin_access": true}`))
			})
		})
	})

	return r
}
