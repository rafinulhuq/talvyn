package eventbus

import (
	"context"
	"testing"
	"time"
)

func TestEventBusPublishAndConsume(t *testing.T) {
	bus, err := New("localhost:6379", "talvyn.test.events")
	if err != nil {
		t.Skipf("Redis not reachable, skipping live test: %v", err)
		return
	}
	defer bus.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	received := make(chan Event, 1)
	go func() {
		_ = bus.SubscribeGroup(ctx, "test_group", "test_consumer", func(ctx context.Context, evt Event) error {
			if evt.EventType == "test.ping" {
				received <- evt
			}
			return nil
		})
	}()

	// Allow consumer group setup
	time.Sleep(200 * time.Millisecond)

	_, err = bus.PublishEvent(ctx, "test.ping", "test-runner", map[string]any{
		"message": "hello redis streams",
	})
	if err != nil {
		t.Fatalf("failed to publish event: %v", err)
	}

	select {
	case evt := <-received:
		if evt.EventType != "test.ping" {
			t.Fatalf("unexpected event type: %s", evt.EventType)
		}
		if evt.Payload["message"] != "hello redis streams" {
			t.Fatalf("unexpected payload: %v", evt.Payload)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("timed out waiting for event delivery")
	}
}
