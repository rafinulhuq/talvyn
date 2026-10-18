FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY pkg/ ./pkg/
COPY services/evaluation/ ./services/evaluation/
WORKDIR /app/services/evaluation
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /evaluation ./cmd/server

FROM alpine:3.20 AS runner
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /evaluation /app/evaluation
EXPOSE 8004
ENTRYPOINT ["/app/evaluation"]
