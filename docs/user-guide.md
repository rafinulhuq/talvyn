# Talvyn — User Guide

> For HR managers and hiring admins. No technical knowledge required.

---

## What Is Talvyn?

Talvyn is a hiring tool that takes away the manual work of screening candidates.

You upload a job description, and the platform automatically:

1. Reads and understands the skills and requirements in the JD
2. Writes a complete candidate test (multiple-choice + written questions)
3. Sends candidates a secure test link by email
4. Grades every submission and gives you an instant evaluation report

You spend your time reviewing shortlisted candidates — not writing questions or marking papers.

---

## Before You Begin

Make sure the platform is running. If it isn't, ask your IT person to run:

```bash
./start.sh
```

Once running, open your browser and go to:

```text
http://localhost
```

Log in with the seeded admin account (`admin@talvyn.com` unless you set
`SEED_ADMIN_EMAIL`). The password is whatever you set as `SEED_ADMIN_PASSWORD`
in `frontend/.env.local` before first startup — if you didn't set one, a
random password was generated and printed once in the frontend logs
(`docker compose logs frontend | grep seed`).

---

## The Main Menu

After logging in you will see the sidebar menu on the left:

| Menu item | What it does |
| --- | --- |
| **Dashboard** | Overview — recent activity, quick stats |
| **Job Descriptions** | Upload and manage your JDs, generate tests |
| **Candidates** | See all candidates who have been invited |
| **Results** | View evaluation reports for completed tests |
| **Settings** | Platform settings, backup/restore, and reset tools |

The admin header also includes a search bar. Use it to find candidates by name,
email, or candidate number, and to jump to job descriptions, tests, and results.

---

## Step 1 — Upload a Job Description

1. Click **Job Descriptions** in the sidebar.
2. Click the **Upload JD** button (top right).
3. Select your PDF or Word document.
4. Wait a few seconds — the platform reads and extracts the key skills automatically.

> **Tip:** The more detailed your JD, the better the questions will be. A JD with clear skill requirements, responsibilities, and seniority level produces much stronger tests.

---

## Step 2 — Generate the Tests

Once your JD has been processed (you will see a green "Ready" status):

1. Click on the JD to open it.
2. Click **Generate Tests**.
3. Wait — this takes **5 to 15 minutes** depending on the server hardware. A live progress bar shows you exactly which test is being built. You can leave the page and come back; the generation continues in the background.

When complete, three tests will appear:

| Test type | What it covers |
| --- | --- |
| **Technical Screening** | Core technical knowledge and depth of expertise |
| **Practical Reasoning** | Logical thinking, problem-solving, and judgment |
| **Role-Specific Problem Solving** | Real-world scenarios specific to this job |

Each test contains **multiple-choice questions** (auto-graded) and **open-ended written questions** (AI-graded).

---

## Step 3 — Review and Approve a Test

The generated tests start as **Draft** — you must review and approve them before sending to candidates.

1. Click on a test to open it.
2. Read through the questions. You can edit any question if needed — click the pencil icon next to it.
3. To see exactly what candidates will see, click **Preview as Candidate** in the action bar.
   - This opens a read-only view with navigation exactly like the candidate experience.
   - You can toggle **Show answer key** to see the correct answer and explanation for each question without leaving the preview.
4. When satisfied, click **Approve** at the top of the page.

> Only approved tests can be sent to candidates. This step ensures you stay in control of what gets assessed.

---

## Step 4 — Invite Candidates

From the JD page, click **Invite Candidate**. You can invite candidates one at a time, in bulk, or by creating one public assessment link.

### Single invite

1. Select the **Single invite** tab.
2. Enter the candidate's name and email address.
3. Choose which test(s) to include (or leave on "All approved tests").
4. Click **Send Invitation**.

### Bulk invite (CSV)

Use this when you have a list of candidates to invite at once.

1. Select the **Bulk CSV** tab.
2. Prepare a `.csv` file with two columns — `email` and `name` (name is optional):

   ```csv
   email,name
   jane@example.com,Jane Smith
   bob@example.com,Bob Jones
   maria@example.com
   ```
3. Drag and drop the file onto the upload area, or click it to browse.
4. A preview table shows all parsed candidates — invalid emails are highlighted and will be skipped automatically.
5. If you have more than one approved test, choose which one to include (or leave on "All").
6. Click **Send X invitations**.

You will see a result for each row — sent, skipped (already has an active invitation), or failed.

> **Note:** The CSV can have a header row or not. It supports comma and semicolon delimiters. Duplicate emails in the file are automatically de-duplicated. Maximum 50 candidates per batch.

### Public assessment link

Use this when you want to share one link with many candidates, for example on a
job post, careers page, or direct message.

1. Open the JD's **Candidates** page.
2. Find the **Public assessment link** card.
3. Click **Create public link**.
4. Copy the generated link and share it.

Public links use this format:

```text
https://talvyn.vercel.app/apply/<slug>
```

When a candidate opens that public link, they enter their name and email address.
The platform then creates a unique private assessment link for that candidate and
sends them into the normal test flow:

```text
https://talvyn.vercel.app/tests/<unique-token>
```

This means one public link can be shared broadly, while every candidate is still
tracked separately by name, email, invitation, attempts, and results.

### If email delivery fails

If Resend is not configured correctly, the invitation is still created. The
success panel shows a copyable **Magic link** so you can send it manually to the
candidate.

Magic links use this format:

```text
https://talvyn.vercel.app/tests/<unique-token>
```

Each candidate gets their own unique, private link. Do not reuse one candidate's
private link for another candidate.

---

**What the candidate experiences after receiving any invitation:**

- A clean, distraction-free test interface
- A visible countdown timer
- Answers are saved automatically every few seconds (nothing is lost on refresh)
- They can review and change answers before submitting
- One submission — they cannot retake the test once submitted

> **Note:** The invitation link expires after **72 hours**. If a candidate misses the window, you can send a new invitation from the Candidates page.

---

## Step 5 — Track Candidate Progress

Go to **Candidates** in the sidebar to see the status of every invitation:

| Status | Meaning |
| --- | --- |
| **Pending** | Invitation sent, candidate has not opened the link yet |
| **Opened** | Candidate clicked the link and viewed the test |
| **In Progress** | Candidate is currently taking the test |
| **Completed** | Candidate submitted — results are ready |
| **Expired** | Link expired before the candidate started |
| **Revoked** | You cancelled the invitation |
| **Terminated** | The candidate's session was ended automatically for an integrity violation (see below) |

### Exam Integrity Enforcement

While a candidate is taking a test, Talvyn actively enforces a few rules
rather than just logging them:

- **Copy, paste, cut, drag/drop, and right-click are blocked** inside the
  exam, including in code-answer fields. Common shortcuts (Ctrl/Cmd+C/V/X/S/P)
  are blocked too; Ctrl/Cmd+A still works *inside* an answer box for normal
  editing. The candidate sees a brief "Copy and paste are disabled" notice
  each time.
- **Switching tabs, minimizing the browser, or leaving the exam window ends
  the assessment immediately** — for that test *and* every other remaining
  test in the same invitation. There's no warning or second chance; this is
  by design, since the spec calls for zero tolerance on the first violation.
  The candidate sees an "Assessment ended" screen and cannot reopen the link
  to continue.
- A terminated candidate's row shows the **Terminated** status everywhere
  invitation status is displayed. Opening their evaluation report shows
  "Terminated — not evaluated" instead of a score, since the attempt was
  never submitted.

This is an integrity **deterrent**, not unbypassable protection — a
candidate using a second device, screen recording, or other tools outside
the browser can still get around it. Treat a termination as a signal to
review, not as automatic proof of misconduct.

---

## Step 6 — View Evaluation Results

Once a candidate submits, the AI grades the test automatically. Go to **Results** to view reports.

### Reading the Evaluation Report

### Top banner — Hiring Recommendation

The AI gives one of four verdicts based on the overall score:

| Recommendation | Score range | What it means |
| --- | --- | --- |
| 🟢 Strong Hire | ≥ 80% | Exceptional performance — strongly recommended |
| ✅ Hire | 65 – 79% | Good fit — recommended for hire |
| 🟡 Maybe | 45 – 64% | Borderline — worth a deeper conversation |
| 🔴 No Hire | < 45% | Significant skill gaps — not recommended |

> The AI recommendation is a **guide**, not a final decision. It is labelled "Preliminary AI Assessment" and your human judgement is always the deciding factor.

### Score breakdown

- Overall percentage and raw score
- MCQ score (auto-graded instantly)
- Open-ended score (AI-graded, with detailed per-question feedback)

### AI Summary, Strengths, and Weaknesses

A plain-English paragraph summarising the candidate's performance, followed by bullet-point lists of what they did well and where they fell short.

### AI-Likeness Estimate (optional)

If your administrator has turned on `AI_LIKENESS_ENABLED`, open-ended answers
get an additional purple card showing an estimated "AI-likeness" percentage,
a confidence level (Low/Medium/High), and — for any flagged answers — the
specific phrases that stood out and a short explanation.

**This is a probabilistic writing-style signal, not proof that a candidate
used AI.** LLM-based AI-text detection can be wrong in both directions: a
strong human answer can be flagged, and a lightly-edited AI answer can pass
unnoticed. Treat it as one input among several — the candidate's full answer,
their score, and your own judgment — never as the sole reason for a decision.
This feature is off by default; ask your administrator if you don't see it.

### Question-by-question breakdown

Click any question to expand it and see:

- The full question text
- The candidate's exact answer (selected option for MCQ, written text for open-ended)
- For MCQ: which option they chose vs the correct answer
- For open-ended: AI feedback explaining the score, criteria met, and criteria missed, plus the AI-likeness detail above if enabled

---

## Overriding the AI Decision

After reviewing the report, you can record your own decision:

1. Scroll to the **Admin Decision** section.
2. Select your recommendation: Strong Hire, Hire, Maybe, or No Hire.
3. Optionally add private notes for your hiring team.
4. Click **Save Decision**.

Your decision replaces the AI recommendation in the report. The original AI assessment is preserved underneath for reference.

---

## Adjusting Marks Manually

If you disagree with the AI score on a specific question:

1. Expand the question card in the breakdown.
2. Scroll to **Admin Score Override**.
3. Enter your score (0 up to the question's maximum).
4. Click **Save** — the total score recalculates immediately.

---

## Exporting a Report

From any evaluation report, use the buttons at the top right:

- **Print / PDF** — opens your browser's print dialog. Choose "Save as PDF" to get a PDF file.
- **Export DOCX** — downloads a formatted Word document with the complete report, including all questions, answers, AI feedback, and your admin notes.

---

## Backup, Restore, And Reset

Open **Settings** from the sidebar and scroll below **AI Evaluation**.

### Create a backup

1. Find **Backup & Restore**.
2. Click **Create backup**.
3. Save the downloaded `Talvyn-backup-...json` file somewhere safe.

The backup contains hiring/product data and uploaded JD files. It does not
include admin users or passwords.

### Restore a backup

1. In **Backup & Restore**, click **Choose backup file**.
2. Select a previous Talvyn backup JSON file.
3. Type `RESTORE BACKUP`.
4. Click **Restore backup**.

Restore replaces current hiring/product data with the backup contents. Admin
users and sign-in stay untouched.

### Delete all hiring data

1. Scroll to **Danger Zone**.
2. Type `DELETE ALL`.
3. Click **Delete all data**.

This clears job descriptions, tests, candidates, invitations, public links,
attempts, answers, evaluations, and uploaded JD files. Admin users are preserved
so you can still log in.

---

## Frequently Asked Questions

**Can a candidate retake the test?**
No. Each invitation link is single-use. If you want a candidate to retake, send a new invitation from the Candidates page.

**What happens if a candidate's browser crashes mid-test?**
Their answers are auto-saved every few seconds. When they reopen the link, they resume exactly where they left off. The countdown timer continues from where it stopped.

**Can I edit questions after approving a test?**
Yes, but approving again is required after any edit. The test goes back to Draft status.

**Does the candidate need a password or account?**
No. They receive a magic link by email or from the recruiter. One click opens the test — no sign-up, no password.

**Can I share one link with many candidates?**
Yes. Use the **Public assessment link** card on the JD's Candidates page. Share the `/apply/<slug>` link; each candidate who registers through it receives their own private `/tests/<token>` link.

**Why is there a copyable link if the email failed?**
The system creates the invitation before sending email. If Resend rejects the email because the API key or sender domain is not configured, Talvyn shows the one-time link so you can still share it manually.

**Is the AI evaluation final?**
No. It is always labelled "Preliminary". You are the decision-maker. Use the Admin Decision section to record your final verdict.

**What does "tab switch detected" mean in the report?**
The system quietly logs if a candidate leaves the test window during the exam (switches tabs, opens another app). It is shown in the evaluation for your awareness — it is not automatically penalised.

**Can I preview a test before sending it to candidates?**
Yes. On the test detail page, click **Preview as Candidate**. You will see the exact experience a candidate gets, and you can use the "Show answer key" toggle to verify correct answers for each question.

**I invited a candidate by mistake — can I cancel it?**
Yes. Go to the Candidates page, find the invitation, and click **Revoke**. The link immediately becomes invalid. You can then send a new invitation if needed.

**I made the AI recommendation but now the candidate changed our minds — can I remove the override?**
Yes. Go back to the Admin Decision panel, deselect your recommendation (click the selected button again), and save. The AI recommendation will show again.

---

## Getting Help

If something is not working, ask your IT contact to check the backend logs:

```bash
docker logs talvyn_backend --tail 50
```

For a full platform restart:

```bash
./stop.sh && ./start.sh
```
