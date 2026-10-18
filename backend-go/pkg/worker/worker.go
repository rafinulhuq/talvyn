package worker

import (
	"context"
	"errors"
	"log/slog"
	"sync"
)

var (
	ErrPoolClosed = errors.New("worker pool is stopped")
	ErrQueueFull  = errors.New("worker queue is full")
)

// Task represents a unit of concurrent work.
type Task func(ctx context.Context) error

// Pool manages a bounded set of worker goroutines executing queued tasks.
type Pool struct {
	concurrency int
	taskQueue   chan Task
	wg          sync.WaitGroup
	ctx         context.Context
	cancel      context.CancelFunc
	closed      bool
	mu          sync.Mutex
}

// NewPool initializes a worker pool with specified concurrency and buffer size.
func NewPool(concurrency, queueSize int) *Pool {
	ctx, cancel := context.WithCancel(context.Background())
	p := &Pool{
		concurrency: concurrency,
		taskQueue:   make(chan Task, queueSize),
		ctx:         ctx,
		cancel:      cancel,
	}

	p.start()
	return p
}

func (p *Pool) start() {
	for i := 0; i < p.concurrency; i++ {
		p.wg.Add(1)
		go func(workerID int) {
			defer p.wg.Done()
			for {
				select {
				case <-p.ctx.Done():
					return
				case task, ok := <-p.taskQueue:
					if !ok {
						return
					}
					if err := task(p.ctx); err != nil {
						slog.Error("Task execution failed", "worker_id", workerID, "error", err)
					}
				}
			}
		}(i)
	}
}

// Submit enqueues a task for worker execution. Non-blocking with ErrQueueFull if channel is saturated.
func (p *Pool) Submit(task Task) error {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return ErrPoolClosed
	}
	p.mu.Unlock()

	select {
	case p.taskQueue <- task:
		return nil
	default:
		return ErrQueueFull
	}
}

// Stop gracefully shuts down the worker pool, draining queued tasks before exiting.
func (p *Pool) Stop() {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return
	}
	p.closed = true
	close(p.taskQueue)
	p.mu.Unlock()

	p.cancel()
	p.wg.Wait()
}
