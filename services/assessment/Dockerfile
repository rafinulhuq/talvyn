FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY pkg/ ./pkg/
COPY services/assessment/ ./services/assessment/
WORKDIR /app/services/assessment
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /assessment ./cmd/server

FROM alpine:3.20 AS runner
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /assessment /app/assessment
EXPOSE 8003
ENTRYPOINT ["/app/assessment"]
