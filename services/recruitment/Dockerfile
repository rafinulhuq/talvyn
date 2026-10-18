FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY pkg/ ./pkg/
COPY services/recruitment/ ./services/recruitment/
WORKDIR /app/services/recruitment
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /recruitment ./cmd/server

FROM alpine:3.20 AS runner
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /recruitment /app/recruitment
EXPOSE 8002
ENTRYPOINT ["/app/recruitment"]
