# ─── Stage 1: Build ─────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install security certificates and build dependencies
RUN apk add --no-cache ca-certificates git tzdata

# Cache Go modules layer
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Compile statically linked binary with stripped debug info
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static'" \
    -o /talvyn-server ./cmd/server

# ─── Stage 2: Runtime ───────────────────────────────────────────
FROM alpine:3.20 AS runner

WORKDIR /app

# Install runtime dependencies (CA certificates for outbound TLS)
RUN apk --no-cache add ca-certificates tzdata

# Create unprivileged application user
RUN addgroup -g 10001 -S talvyn && \
    adduser -u 10001 -S talvyn -G talvyn

COPY --from=builder /talvyn-server /app/talvyn-server

# Enforce non-root execution
USER talvyn:talvyn

# Expose HTTP service port
EXPOSE 8000

# Health check probe against liveness endpoint
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8000/health/live || exit 1

ENTRYPOINT ["/app/talvyn-server"]
