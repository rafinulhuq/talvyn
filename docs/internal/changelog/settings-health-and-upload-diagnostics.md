# Settings Health And Upload Diagnostics

Date: 2026-06-20

This release ships the first Reliability batch from the product reviewer
roadmap: service health visibility, clearer upload failures, and findable
maintenance tools.

## What Changed

| Area | Change |
| --- | --- |
| Settings | Settings is now organized into `Overview`, `Integrations`, `Maintenance`, and `Audit Log` tabs. |
| System Health | `Overview` includes a System Health card that checks database, Redis, worker queue, storage, Ollama, email configuration, magic-link base URL, and allowed origins. |
| Readiness API | `/api/v1/health/ready` now reports non-secret dependency/config status plus plain-English actions. |
| Upload proxy | `/api/jd/upload` now preserves structured backend errors and adds specific proxy-side codes for malformed uploads, empty files, oversized files, unsupported files, misconfiguration, and backend unavailability. |
| Upload UI | `JdUploadForm` maps upload errors into admin-friendly messages and shows optional technical details. |

## Notes

- Database, Redis, and Ollama connectivity remain hard readiness signals.
- Email, magic-link URL, CORS, and S3 configuration warnings are surfaced to
  admins without necessarily making the API unhealthy.
- The worker check currently verifies queue connectivity from the API process;
  a future worker heartbeat table/key would make this stronger.

