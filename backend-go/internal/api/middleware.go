package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"talvyn-backend/internal/domain"
	"talvyn-backend/internal/repository/postgres"
	"talvyn-backend/pkg/token"
)

type contextKey string

const (
	actorContextKey   contextKey = "actor"
	attemptContextKey contextKey = "attempt_token"
)

// GetActor extracts the authenticated domain.User from request context.
func GetActor(ctx context.Context) *domain.User {
	if val := ctx.Value(actorContextKey); val != nil {
		if u, ok := val.(*domain.User); ok {
			return u
		}
	}
	return nil
}

// GetAttemptToken extracts candidate magic link token from request context.
func GetAttemptToken(ctx context.Context) string {
	if val := ctx.Value(attemptContextKey); val != nil {
		if t, ok := val.(string); ok {
			return t
		}
	}
	return ""
}

// LoggerMiddleware logs incoming requests with duration and status code.
func LoggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &statusResponseWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(ww, r)

		slog.Info("HTTP Request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"remote_addr", r.RemoteAddr,
		)
	})
}

type statusResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusResponseWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// VerifyInternalToken enforces constant-time validation of X-Internal-Token from Next.js server actions.
func VerifyInternalToken(internalSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			provided := r.Header.Get("X-Internal-Token")
			if provided == "" || !token.CompareInternalSecret(provided, internalSecret) {
				http.Error(w, `{"error":"Missing or invalid X-Internal-Token"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ActorMiddleware resolves the actor user from the X-Actor-Id header.
func ActorMiddleware(repo *postgres.Repository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actorID := r.Header.Get("X-Actor-Id")
			if actorID != "" {
				user, err := repo.GetByID(r.Context(), actorID)
				if err == nil && user.IsActive {
					ctx := context.WithValue(r.Context(), actorContextKey, user)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireMinRole ensures the resolved actor possesses at least the specified privilege rank.
func RequireMinRole(minRole domain.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actor := GetActor(r.Context())
			if actor == nil {
				http.Error(w, `{"error":"Authenticated actor required"}`, http.StatusUnauthorized)
				return
			}
			if !actor.HasMinRole(minRole) {
				http.Error(w, `{"error":"Forbidden: insufficient permissions"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// VerifyAttemptToken ensures candidate cockpit endpoints supply the X-Attempt-Token header.
func VerifyAttemptToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t := r.Header.Get("X-Attempt-Token")
		if t == "" {
			http.Error(w, `{"error":"Missing X-Attempt-Token header"}`, http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), attemptContextKey, t)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// JWTAuthMiddleware parses standard Authorization: Bearer <jwt> headers.
func JWTAuthMiddleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, `{"error":"Missing Bearer token"}`, http.StatusUnauthorized)
				return
			}

			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			claims := jwt.MapClaims{}
			token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method")
				}
				return []byte(jwtSecret), nil
			})

			if err != nil || !token.Valid {
				http.Error(w, `{"error":"Invalid token"}`, http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
