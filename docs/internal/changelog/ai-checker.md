# Standalone AI Checker

Added an admin-facing **AI Checker** workspace for estimating AI-likeness in
uploaded or pasted documents.

## What Shipped

| Area | Change |
| --- | --- |
| Sidebar | Added **AI Checker** under the admin dashboard navigation. |
| Admin UI | New `/dashboard/ai-checker` page accepts pasted text or PDF, DOCX, TXT, and Markdown uploads. PDF/DOCX extraction tries the browser-side WASM parser first, then falls back to server-side extraction when needed. |
| Backend API | New `/api/v1/ai-checker/check` endpoint estimates AI-likeness from submitted document text. |
| Background checks | New `/api/v1/ai-checker/jobs` and `/api/v1/ai-checker/jobs/{job_id}` endpoints queue long document checks through ARQ/Redis and let the UI poll status/results, avoiding Vercel/proxy network timeouts. |
| Extraction fallback | New `/api/v1/ai-checker/extract` backend endpoint plus a dedicated Next.js `/api/ai-checker/extract` upload route avoid sending binary PDFs through the generic JSON proxy. |
| Long documents | Backend samples representative sections and aggregates the result instead of judging only the first paragraph. |
| Safety copy | UI and API responses explicitly frame the result as a probabilistic writing-style signal, not proof of AI use. |

## Notes

- Candidate evaluation AI-likeness remains opt-in via `AI_LIKENESS_ENABLED`.
- The standalone checker is an explicit admin action, so it can run without
  enabling automatic candidate-answer AI-likeness.
- The checker uses the existing Ollama model; no extra model is required.
- The admin UI uses the background job endpoints for analysis. The synchronous
  `/check` route remains available for internal/API compatibility, but the
  browser should avoid it for larger documents.
- The background job system requires the ARQ `worker` container to actually
  be running — see
  [production-reliability-fixes.md](production-reliability-fixes.md) for a
  case where production was missing that container entirely, which surfaced
  as a misleading "AI checker job not found" error in the UI.
