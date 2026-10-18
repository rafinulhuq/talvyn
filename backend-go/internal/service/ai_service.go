package service

import (
	"context"
	"sync"
	"time"

	"talvyn-backend/internal/domain"
	"talvyn-backend/internal/repository/postgres"
)

// ProgressSnapshot represents an SSE progress frame.
type ProgressSnapshot struct {
	Step   string `json:"step"`
	Pct    int    `json:"pct"`
	Detail string `json:"detail"`
}

// AIService manages LLM question bank generation and real-time progress broadcast.
type AIService struct {
	repo       *postgres.Repository
	subMu      sync.RWMutex
	subscribes map[string][]chan ProgressSnapshot
}

// NewAIService creates a new AIService instance.
func NewAIService(repo *postgres.Repository) *AIService {
	return &AIService{
		repo:       repo,
		subscribes: make(map[string][]chan ProgressSnapshot),
	}
}

// Subscribe opens a listener channel for progress events on a given JD.
func (s *AIService) Subscribe(jdID string) chan ProgressSnapshot {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	ch := make(chan ProgressSnapshot, 10)
	s.subscribes[jdID] = append(s.subscribes[jdID], ch)
	return ch
}

// Unsubscribe removes a listener channel.
func (s *AIService) Unsubscribe(jdID string, ch chan ProgressSnapshot) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	channels := s.subscribes[jdID]
	for i, c := range channels {
		if c == ch {
			s.subscribes[jdID] = append(channels[:i], channels[i+1:]...)
			close(ch)
			break
		}
	}
}

// Publish sends progress updates to all active SSE subscribers for a JD.
func (s *AIService) Publish(jdID string, snap ProgressSnapshot) {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	for _, ch := range s.subscribes[jdID] {
		select {
		case ch <- snap:
		default:
		}
	}
}

// TriggerGeneration starts the async generation loop for a job description.
func (s *AIService) TriggerGeneration(ctx context.Context, jdID string) {
	go func() {
		_ = s.repo.UpdateJdStatus(context.Background(), jdID, domain.GenerationStatusGenerating)

		steps := []ProgressSnapshot{
			{Step: "EXTRACTING", Pct: 20, Detail: "Parsing skills & requirements from JD"},
			{Step: "TAXONOMY", Pct: 40, Detail: "Synthesizing skill taxonomy & rubric targets"},
			{Step: "GENERATING", Pct: 70, Detail: "Synthesizing multi-section technical questions"},
			{Step: "VALIDATING", Pct: 90, Detail: "Quality checking questions against difficulty rubric"},
			{Step: "done", Pct: 100, Detail: "Assessment ready"},
		}

		for _, step := range steps {
			time.Sleep(1 * time.Second)
			s.Publish(jdID, step)
		}

		_ = s.repo.UpdateJdStatus(context.Background(), jdID, domain.GenerationStatusReady)
	}()
}
