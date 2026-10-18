package worker

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestWorkerPoolExecution(t *testing.T) {
	pool := NewPool(4, 50)
	defer pool.Stop()

	var counter int64
	totalTasks := 20

	for i := 0; i < totalTasks; i++ {
		err := pool.Submit(func(ctx context.Context) error {
			atomic.AddInt64(&counter, 1)
			return nil
		})
		if err != nil {
			t.Fatalf("failed to submit task: %v", err)
		}
	}

	// Give workers time to finish
	time.Sleep(100 * time.Millisecond)

	if got := atomic.LoadInt64(&counter); got != int64(totalTasks) {
		t.Fatalf("expected %d tasks completed, got %d", totalTasks, got)
	}
}
