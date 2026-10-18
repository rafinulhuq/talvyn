.PHONY: all build run dev test lint clean docker-build docker-run

APP_NAME := talvyn-backend
BIN_DIR := bin
MAIN_PKG := ./cmd/server
PORT ?= 8000

all: build

build:
	@echo "==> Building $(APP_NAME) binary..."
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 go build -ldflags="-s -w" -o $(BIN_DIR)/server $(MAIN_PKG)
	@echo "==> Binary built at $(BIN_DIR)/server"

run: build
	@echo "==> Starting $(APP_NAME)..."
	PORT=$(PORT) ./$(BIN_DIR)/server

dev:
	@echo "==> Starting in live development mode..."
	PORT=$(PORT) go run $(MAIN_PKG)

test:
	@echo "==> Running tests with race detector..."
	go test -v -race ./...

lint:
	@echo "==> Running linter..."
	@which golangci-lint > /dev/null || (echo "golangci-lint not installed" && exit 1)
	golangci-lint run ./...

clean:
	@echo "==> Cleaning build artifacts..."
	rm -rf $(BIN_DIR)

docker-build:
	@echo "==> Building Docker image $(APP_NAME):latest..."
	docker build -t $(APP_NAME):latest .

docker-run:
	@echo "==> Running container on port $(PORT)..."
	docker run -p $(PORT):8000 --env-file ../.env $(APP_NAME):latest
