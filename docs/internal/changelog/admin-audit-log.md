# Admin Audit Log

Date: 2026-06-20

This update adds an append-only audit trail for sensitive admin actions,
attributed to the admin who performed them.

## What Shipped

| Area | Change |
| --- | --- |
| Audit trail | A new `admin_audit_logs` table records invitation revoke/resend, evaluation/question-score overrides, and data reset/restore. |
| Actor attribution | The Next.js proxy forwards the authenticated admin's session ID as `X-Actor-Id`; FastAPI logs it alongside each action. Actions taken without a session (e.g. background jobs) are logged with a null actor rather than failing. |
| Admin UI | Settings has a new "Audit Log" section showing a paginated, newest-first feed with the action, a human-readable summary, who did it, and when. |
| API | `GET /api/v1/admin/audit-log` returns paginated entries with the actor's name/email joined in. |

## Design Notes

- The audit table is intentionally excluded from the backup/restore/reset table
  lists in `admin_service.py`, the same way admin users are — so the trail
  (including the reset/restore action itself) survives a data reset or restore
  instead of erasing the evidence of what happened.
- Each audit entry is written in the same database transaction as the action it
  describes (before the existing `commit()` call), so the action and its audit
  record always succeed or fail together.
- `X-Actor-Id` follows the same forwarding convention already used for
  `X-Uploader-Id` and `X-Inviter-Id` — the Next.js proxy reads the NextAuth
  session's `token.sub` and forwards it as a header FastAPI trusts.

## Next Steps

Extend audit coverage to future sensitive actions as they ship (outbound
webhooks, RBAC permission changes, team comments), and consider surfacing a
per-candidate or per-JD scoped view once the table has more entries.
