FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY pkg/ ./pkg/
COPY services/analytics/ ./services/analytics/
WORKDIR /app/services/analytics
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /analytics ./cmd/server

FROM alpine:3.20 AS runner
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /analytics /app/analytics
EXPOSE 8005
ENTRYPOINT ["/app/analytics"]
