# Talvyn — Executive Summary

## What It Is

Talvyn is an internal hiring tool that turns a job description into a complete, gradeable
candidate test in minutes instead of days. A hiring admin uploads a job description (JD), the
system reads it and figures out what skills matter, automatically writes three different tests
for that role, and — once an admin approves them — sends candidates a simple link to take the
test online. The system then grades what candidates submit using AI, and gives the admin a
report with a recommendation. A human admin always has the final say: every AI-generated test
and every AI-graded score can be reviewed and overridden before it's final.

## The Problem It Solves

Without a tool like this, a hiring admin's day for a new role looks like: write a set of test
questions by hand, decide on difficulty and question types, email each candidate individually
with instructions and a deadline, track responses manually, read every answer, score it by hand
or against an answer key, and write up notes before recommending. This repeats from scratch for
every role and every batch of candidates — slow, inconsistent across admins, and full of work
that doesn't need human judgment until the final review.

With Talvyn, the day looks different: upload the JD, click to generate tests, skim and
approve (or tweak) the AI-written questions, upload a list of candidate emails (or a CSV for a
larger batch), and wait for a notification when results are ready. Grading and a draft
recommendation are produced automatically; the admin's job becomes reviewing, spot-checking, and
overriding anything that looks off before deciding who moves forward.

## Who Uses It

- **Hiring admins / HR teams** — the buyers and day-to-day operators. They upload job
  descriptions, approve generated tests, invite candidates, and review AI evaluation results.
  This is the primary audience the platform is built for.
- **Candidates** — the other side of the platform. They receive a single email link ("magic
  link" — a one-click, no-password-needed link tied to their invitation), take a timed test in
  the browser, and submit it. They do not need an account or password.

## Key Features

- **JD upload and AI parsing** — admin uploads a PDF or Word document describing the role; the
  system extracts the skills, responsibilities, and seniority level automatically.
- **Automatic 3-test generation** — the system writes three separate tests per role (Technical,
  Reasoning, and Problem Solving), each mixing multiple-choice, open-ended, and optional coding
  questions, sized to the role's requirements.
- **Admin review/approval gate** — generated tests are drafts until an admin reviews and
  approves them; admins can edit individual questions before approving.
- **Candidate magic-link testing** — candidates get a single emailed link, no account creation
  or password required, that takes them straight into a timed test in their browser.
- **AI evaluation with admin override** — submitted answers are graded automatically (including
  open-ended written answers, not just multiple choice), producing a score and a hire/no-hire
  style recommendation; admins can change any AI-assigned score before finalizing results.
  AI is configured to provide best-effort guidance, not unilateral hiring authority.
- **Bulk invites** — admins can upload a spreadsheet of candidate names and emails to invite many
  people for the same role in one action, instead of sending invitations one at a time.
- **Leaderboards and reports** — admins can see all candidates for a role ranked by score, and
  view a detailed report per candidate covering their answers, AI scoring rationale, and any
  admin adjustments.

## How It Works, Step by Step

1. Admin uploads a job description.
2. The system reads it and extracts the key skills and requirements.
3. The system automatically generates three complete tests for the role.
4. Admin reviews the generated tests and approves them (editing first, if needed).
5. Admin invites candidates — individually or in bulk via a spreadsheet upload.
6. Each candidate clicks their personal link and takes the test in their browser, within a time
   limit.
7. The AI grades the submission and produces a score and recommendation.
8. Admin reviews the results, can override any score, and decides who advances.

## The Value, in Plain Terms

The mechanism of savings is straightforward: work that used to require a person — writing
custom test questions for every role, individually emailing every candidate, and reading and
scoring every submitted answer by hand — now happens automatically, with the human reviewing
and approving only at the points that matter (before a test goes out, and before a result is
final). This doesn't eliminate the need for a hiring admin; it shifts their time away from
manual drafting and reading and toward judgment calls. No specific time or cost savings figures
are given here, since they haven't been measured for Talvyn in production use — this section
describes the mechanism, not a measured outcome.

## Current Status — Honest Assessment

Talvyn is a working, fairly mature internal platform, not a prototype. Per
`docs/enterprise/_facts.md`, it has 213 automated backend tests across 11 test files, a CI
pipeline that runs those tests on every change, 48 API endpoints, and 12 database tables backing
the full workflow above. The project's engineering log (`docs/future-improvements.md`) records
50 hardening and performance improvements — all marked done and individually re-verified against
the live code as of 2026-06-18 — covering things like background job reliability, rate
limiting, and a progress-tracking bug that only showed up when multiple server processes ran at
once.

That said, "well-tested internal platform" is a different bar than "audited and certified for
handling sensitive, customer-facing production traffic at scale." Talvyn has not undergone
that kind of formal security audit or third-party certification. A companion document,
`docs/enterprise/11-security-audit.md`, covers the security posture in detail and should be read
before any decision to expose this system to external candidates or sensitive data at scale.
This caveat is a normal, expected gap for a platform at this stage — not a sign of a specific
known flaw — but it is a real gap and is called out here deliberately rather than glossed over.
