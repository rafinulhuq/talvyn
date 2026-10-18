# Email Service Integration — Overview

Date: 2026-08-14

A full codebase survey of email-sending found a working, provider-agnostic
layer (`backend/app/services/email_service.py`, SMTP or Resend) already in
place, with Brevo already documented as the recommended free SMTP relay —
but several real gaps in *where* email is actually used, plus some
duplication/drift worth fixing while touching this code. Phased like the
lime-brand rebrand before it — each phase ships as its own PR through the
normal CI → merge → deploy pipeline.

## What Shipped

| Phase | Area | Status |
| --- | --- | --- |
| 1 | Brevo SMTP wired up and verified with real sends; shared `render_email_shell()` helper extracted (was duplicated between the invitation email and the Highgarden alert digest); both templates recolored from the pre-rebrand `#00ef00`/`#231f20` palette to the current lime/near-black/cream brand | Shipped |
| 2 | Signup/access-request notifications (admin notified on new request, requester notified on approve/reject) — previously silent | Planned |
| 3 | Candidate notification on invitation revoke/expiry — previously silent | Planned |
| 4 | Password-reset ("forgot password") flow — didn't exist at all before this initiative | Planned |

## Phase 1 detail

- **Brevo SMTP**: `SMTP_HOST=smtp-relay.brevo.com` (+ port/user/pass) set in
  `backend/.env` (gitignored, prod host only). Hit Brevo's IP-authorization
  security feature on the first real send (`525 Unauthorized IP address`) —
  root-caused to this host's outbound IP rotating across a small NAT pool
  (`103.135.135.56`/`.58` observed across consecutive connections), so
  per-IP allow-listing wasn't viable; fixed by disabling IP authorization
  account-wide in Brevo instead of chasing individual IPs.
- **Shared template**: `render_email_shell()` in `email_service.py` factors
  out the header/card/footer chrome previously duplicated between
  `_build_invitation_html` and the Highgarden digest builder in
  `backend/app/api/v1/admin.py`. Both now build only their own body content
  and call the shared shell.
- **Brand refresh**: header bg `ink-950 #0a0a0a`, eyebrow/CTA `brand-500
  #d7f050`, outer background `cream #faf8ef`, card border switched from a
  soft box-shadow to the site's established `border: 2px solid #0a0a0a`
  treatment — matching `docs/changelog/lime-near-black-rebrand-overview.md`.
- Verified via two real end-to-end sends through Brevo (not just a health
  check) — confirmed delivery, TLS, correct Reply-To, and (after the
  brand-refresh commit) correct rebranded rendering.

(Per-phase detail for 2-4 lives in their own PR descriptions as they land;
this file tracks overall status and decisions that apply across every
phase.)
