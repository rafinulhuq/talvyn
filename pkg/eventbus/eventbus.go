package eventbus

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// StreamName default constant for the event mesh.
const DefaultStreamName = "talvyn.events"

// Event defines standard event envelope in the Talvyn event mesh.
type Event struct {
	EventID   string         `json:"event_id"`
	EventType string         `json:"event_type"`
	Source    string         `json:"source"`
	Timestamp time.Time      `json:"timestamp"`
	Payload   map[string]any `json:"payload"`
}

// HandlerFunc callback for event processing.
type HandlerFunc func(ctx context.Context, event Event) error

// EventBus provides Redis Streams pub/sub capabilities with consumer groups.
type EventBus struct {
	client     *redis.Client
	streamName string
}

// New creates an EventBus connected to Redis at redisAddr.
func New(redisAddr string, streamName string) (*EventBus, error) {
	if streamName == "" {
		streamName = DefaultStreamName
	}

	opts, err := redis.ParseURL(redisAddr)
	if err != nil {
		opts = &redis.Options{
			Addr: redisAddr,
		}
	}

	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis at %s: %w", redisAddr, err)
	}

	return &EventBus{
		client:     rdb,
		streamName: streamName,
	}, nil
}

// PublishEvent sends a new event to the Redis Stream.
func (b *EventBus) PublishEvent(ctx context.Context, eventType, source string, payload map[string]any) (*Event, error) {
	evt := &Event{
		EventID:   "evt_" + uuid.New().String(),
		EventType: eventType,
		Source:    source,
		Timestamp: time.Now().UTC(),
		Payload:   payload,
	}

	dataBytes, err := json.Marshal(evt)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal event: %w", err)
	}

	cmd := b.client.XAdd(ctx, &redis.XAddArgs{
		Stream: b.streamName,
		Values: map[string]interface{}{
			"event_id":   evt.EventID,
			"event_type": evt.EventType,
			"source":     evt.Source,
			"data":       string(dataBytes),
		},
	})

	if err := cmd.Err(); err != nil {
		return nil, fmt.Errorf("failed to publish to stream %s: %w", b.streamName, err)
	}

	return evt, nil
}

// SubscribeGroup listens for events in a consumer group, processing each with handler.
func (b *EventBus) SubscribeGroup(ctx context.Context, groupName, consumerName string, handler HandlerFunc) error {
	// Ensure group exists
	err := b.client.XGroupCreateMkStream(ctx, b.streamName, groupName, "0").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}

	slog.Info("Consumer group subscribed", "stream", b.streamName, "group", groupName, "consumer", consumerName)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Read new messages targeted to this consumer group
		streams, err := b.client.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    groupName,
			Consumer: consumerName,
			Streams:  []string{b.streamName, ">"},
			Count:    10,
			Block:    2 * time.Second,
		}).Result()

		if err != nil {
			if errors.Is(err, redis.Nil) || errors.Is(err, context.Canceled) {
				continue
			}
			slog.Warn("XReadGroup error, retrying...", "error", err)
			time.Sleep(500 * time.Millisecond)
			continue
		}

		for _, stream := range streams {
			for _, message := range stream.Messages {
				dataStr, ok := message.Values["data"].(string)
				if !ok {
					// Corrupt or non-standard message format, ack and discard
					_ = b.client.XAck(ctx, b.streamName, groupName, message.ID)
					continue
				}

				var evt Event
				if err := json.Unmarshal([]byte(dataStr), &evt); err != nil {
					slog.Error("Failed to decode stream event", "msg_id", message.ID, "error", err)
					_ = b.client.XAck(ctx, b.streamName, groupName, message.ID)
					continue
				}

				// Process event with caller-supplied handler
				if err := handler(ctx, evt); err != nil {
					slog.Error("Handler failed processing event", "event_id", evt.EventID, "type", evt.EventType, "error", err)
					// In production, increment retry counter or push to DLQ if max retries exceeded
				} else {
					// Successfully processed, acknowledge message
					_ = b.client.XAck(ctx, b.streamName, groupName, message.ID)
				}
			}
		}
	}
}

// Client returns underlying redis client.
func (b *EventBus) Client() *redis.Client {
	return b.client
}

// Close closes the Redis connection.
func (b *EventBus) Close() error {
	return b.client.Close()
}
