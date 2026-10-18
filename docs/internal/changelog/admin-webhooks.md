# Outbound Webhooks

Date: 2026-06-20

This update adds a signed outbound webhook system so external tools (Zapier/Make,
an ATS, or a custom integration) can react to hiring events in real time.

## What Shipped

| Area | Change |
| --- | --- |
| Subscriptions | Admins create webhook subscriptions in Settings -> Webhooks: an endpoint URL plus the event types it should receive. |
| Events | `invitation.created`, `attempt.started`, `attempt.submitted`, `evaluation.completed` — fired from the same service-layer functions that perform those actions. |
| Signing | Each subscription gets its own HMAC-SHA256 secret (shown once at creation) used to sign every delivery, sent as `X-Talvyn-Signature: sha256=<hex>`. |
| Delivery | Dispatched via the existing ARQ worker, with exponential-backoff retry (5 attempts) on non-2xx responses or connection errors. |
| Visibility | A per-subscription delivery log (status, response code, attempt count, timestamp) plus a "send test event" button so admins can verify an endpoint before relying on it. |
| Audit trail | Creating, updating, or deleting a webhook subscription writes an entry to the admin audit log added in the previous update. |

## Design Notes

- Subscriptions are global for this iteration (not scoped per JD) — the admin UI
  doesn't group settings by JD today, and nothing in the roadmap needed that
  granularity yet. Revisit if a customer needs per-JD routing.
- `webhook_service` enqueues jobs via a module-level ARQ pool reference
  (`set_arq_pool()`, wired once at FastAPI startup) rather than `app.state.arq_pool`,
  because the 4 lifecycle hooks are deep service functions with no `Request` object
  — the same pattern already used for `attempt_service.set_redis_client()`.
- A webhook failure can never break the candidate/admin request it's attached to:
  `enqueue_event()` swallows and logs any exception instead of propagating it.
- This is the foundation for the next roadmap items — Zapier/Make and ATS adapters
  (Greenhouse/Lever/Ashby) — which will consume these same events rather than each
  needing their own delivery/retry/signing plumbing.

## Next Steps

A thin Zapier/Make "app" on top of these events, then ATS-specific adapters. Optional
fast-follow: per-JD scoped subscriptions if a customer asks for it.
