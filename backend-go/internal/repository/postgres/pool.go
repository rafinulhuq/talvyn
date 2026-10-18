package postgres

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates and validates a pgxpool connection pool.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database url: %w", err)
	}

	cfg.MaxConns = 30
	cfg.MinConns = 5
	cfg.MaxConnLifetime = 1 * time.Hour
	cfg.MaxConnIdleTime = 15 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connectivity with retry loop
	var pingErr error
	for attempt := 1; attempt <= 5; attempt++ {
		pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		pingErr = pool.Ping(pingCtx)
		cancel()

		if pingErr == nil {
			slog.Info("Database connection pool established", "max_conns", cfg.MaxConns)
			return pool, nil
		}

		slog.Warn("Database not ready, retrying...", "attempt", attempt, "error", pingErr)
		time.Sleep(2 * time.Second)
	}

	pool.Close()
	return nil, fmt.Errorf("database unreachable after 5 attempts: %w", pingErr)
}
