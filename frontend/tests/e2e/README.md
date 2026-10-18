# Talvyn E2E Tests

This suite is the Phase 3 frontend test harness foundation. It is intentionally
safe to run on a developer machine without real admin credentials, seeded data,
or external LLM/email services.

## Commands

```bash
npm run test:e2e
npm run test:e2e:ui
```

`playwright.config.ts` starts the Next.js dev server on port `3100` by default.
Set `PLAYWRIGHT_BASE_URL` to run against an already-started app:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

## Current Coverage

- Landing page navigation to login.
- Landing page anchor navigation to the process section.
- Admin auth guard redirect from protected dashboard routes.
- Unsafe login callback URL handling before credential submission.
- Login form keyboard order.
- Login validation error announcements and `aria-invalid` state.
- Axe smoke coverage for `/` and `/login`, blocking critical/serious WCAG A/AA
  violations.
- Candidate terminal pages:
  - `/test/complete`
  - `/test/expired`
- Axe smoke coverage for candidate terminal pages.

## Next Coverage To Add

- Authenticated admin flows using a seeded test admin or storage state fixture.
- JD upload validation with backend fixture data.
- Candidate exam start/answer/submit flows with stable seeded tokens.
- Results report rendering, including AI-likeness present and absent states.
- Destructive settings confirmation flow.
