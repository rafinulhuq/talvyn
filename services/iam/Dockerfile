FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY pkg/ ./pkg/
COPY services/iam/ ./services/iam/
WORKDIR /app/services/iam
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /iam ./cmd/server

FROM alpine:3.20 AS runner
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /iam /app/iam
EXPOSE 8001
ENTRYPOINT ["/app/iam"]
