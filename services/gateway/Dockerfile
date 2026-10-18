FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY pkg/ ./pkg/
COPY services/gateway/ ./services/gateway/
WORKDIR /app/services/gateway
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /gateway ./cmd/server

FROM alpine:3.20 AS runner
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /gateway /app/gateway
EXPOSE 8000
ENTRYPOINT ["/app/gateway"]
