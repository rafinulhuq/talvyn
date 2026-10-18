.PHONY: all build test microservices-build microservices-test microservices-up microservices-down clean

ALL_MODULES := ./backend-go/... ./pkg/... ./services/gateway/... ./services/assessment/... ./services/evaluation/... ./services/iam/... ./services/recruitment/... ./services/analytics/...

all: build

build:
	@echo "==> Building all Go microservices across workspace..."
	go build $(ALL_MODULES)
	@echo "==> All services compiled successfully!"

test:
	@echo "==> Running full test suite..."
	go test -v $(ALL_MODULES)

microservices-build: build

microservices-test: test

microservices-up:
	@echo "==> Starting microservices via Docker Compose..."
	docker compose -f docker-compose.microservices.yml up --build -d

microservices-down:
	@echo "==> Stopping microservices..."
	docker compose -f docker-compose.microservices.yml down

clean:
	@echo "==> Cleaning build artifacts..."
	rm -rf backend-go/bin services/*/bin
