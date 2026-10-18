# Admin Search, Backup, Restore, And Reset

Date: 2026-06-20

This update adds admin-facing maintenance tools for day-to-day operations and
test-data cleanup.

## What Shipped

| Area | Change |
| --- | --- |
| Admin search | Dashboard header search now finds candidates, candidate numbers, emails, job descriptions, tests, and evaluated results. |
| Backup | Settings can download a Talvyn JSON backup containing hiring data and uploaded JD files. |
| Restore | Settings can restore from a previous Talvyn JSON backup after typing `RESTORE BACKUP`. |
| Reset | Settings Danger Zone can delete all hiring/product data after typing `DELETE ALL`. |

## Data Scope

The backup, restore, and reset tools cover product/hiring data:

- candidates and candidate numbers
- job descriptions and extracted data
- generated tests and questions
- public assessment links
- invitations and magic-link state
- attempts, answers, suspicious events, evaluations, and question feedback
- uploaded JD files

Admin users and authentication records are intentionally preserved so a reset or
restore does not lock operators out of the dashboard.

## Operational Notes

The in-app backup is useful before demos, QA resets, manual cleanup, and small
production maintenance windows. It is not a replacement for scheduled off-server
database and volume backups. Production operators should still keep `pg_dump`
and uploaded-file backups outside the application host, then perform periodic
restore drills.
