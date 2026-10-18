# ─── Builder stage — compiles wheels, never shipped to the runtime image ──
FROM python:3.14-slim AS builder

WORKDIR /app

# gcc/libffi-dev/libssl-dev are only needed to build a couple of C-extension
# wheels (e.g. cryptography) — the compiled output is copied below, the
# compiler toolchain itself is not.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─── Runtime stage — slim, no build tools, non-root ───────────────────────
FROM python:3.14-slim

WORKDIR /app

# curl is needed by the HEALTHCHECK below; tesseract-ocr is the runtime
# binary behind the scanned-PDF OCR fallback (pytesseract) used by bulk
# knowledge ingestion. No compiler toolchain here.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /usr/sbin/nologin appuser

# Installed packages from the builder stage (site-packages + console scripts)
COPY --from=builder /install /usr/local

# Copy application code
COPY . .
COPY docker-entrypoint.sh /usr/local/bin/talvyn-backend-entrypoint

# Create uploads directory and hand the whole app dir to the non-root user
RUN mkdir -p /app/uploads/jds /app/uploads/tmp \
    && chmod +x /app/prestart.sh /usr/local/bin/talvyn-backend-entrypoint \
    && chown -R appuser:appuser /app

# Expose port
EXPOSE 8000

ENTRYPOINT ["talvyn-backend-entrypoint"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Run Alembic migrations, then start uvicorn with 4 workers.
#
# Why 4 workers?  Each worker is an independent OS process (not a thread),
# so they can run concurrently on multi-core hosts.  For Ollama-bound workloads
# (extraction, generation, evaluation) this means up to 4 independent requests
# can be accepted while one is blocked waiting for Ollama.
#
# Alembic runs BEFORE workers start: it applies pending migrations once,
# using a PostgreSQL advisory lock, so concurrent worker start-up doesn't race.
CMD ["sh", "-c", "bash /app/prestart.sh && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4"]
