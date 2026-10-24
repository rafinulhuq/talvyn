# Talvyn Codebase Analysis Report

**Talvyn - AI Hiring Assessment Platform**

Prepared for codebase understanding, developer handover, business review, and maintenance planning.

Prepared by: Talvyn Ltd.

Date: 8 June 2026

---

## Document Control

| Item | Details |
| --- | --- |
| Document title | Talvyn Codebase Analysis Report |
| Project reviewed | Talvyn |
| Review location | `/home/a-m-rafinul-huq/Desktop/Office/Talvyn/Talvyn-main/Talvyn` |
| Version | 1.0 |
| Prepared by | Talvyn Ltd. |
| Reference style followed | Deployment handover guide style: cover details, numbered sections, tables, validation notes, handover checklist, and recommended sequence |
| Review scope | Backend, frontend, database models, migrations, tests, Docker files, startup scripts, and documentation |
| Excluded from review | Generated dependency/build folders such as `node_modules`, `.next`, `.venv`, uploaded files, and runtime database data |
| Approximate size reviewed | 275 project files, 144 backend files, 112 frontend files, 10 documentation files, 13 backend test files, about 36,684 text/code lines |

---

## 1. Overview

Talvyn is an AI-powered hiring assessment platform. In plain language, it helps a hiring team turn a job description into candidate tests, send those tests to candidates, collect answers, and produce AI-assisted evaluation reports.

For a non-technical reader, the platform works like this:

1. A hiring admin uploads a job description.
2. The system reads the document and extracts skills, role level, responsibilities, and recommended test topics.
3. The system generates three assessment tests.
4. The admin reviews and approves the tests.
5. Candidates receive secure test links by email.
6. Candidates complete a timed test in the browser.
7. The system grades answers and prepares a report.
8. The admin can accept, override, or adjust the AI recommendation.

For a developer, Talvyn is a full-stack application with:

| Layer | Technology observed in code | Main purpose |
| --- | --- | --- |
| Frontend | Next.js 15.1.3, React 19, TypeScript, Tailwind CSS | Admin dashboard and candidate test interface |
| Frontend auth | NextAuth.js v4, Prisma, bcryptjs | Admin login and session handling |
| Backend | FastAPI 0.115.6, Python 3.12, Pydantic v2 | REST API, business logic, AI orchestration |
| Database access | SQLAlchemy async, asyncpg, Prisma | Backend data operations and frontend auth queries |
| Database | PostgreSQL 16 in Docker | Persistent application data |
| AI engine | Ollama with Gemma 3 models | Local skill extraction, test generation, and evaluation |
| File parsing | PyMuPDF, python-docx | Extract text from PDF and DOCX job descriptions |
| Email | Mailpit in development, Resend/SMTP support | Candidate invitation emails |
| Deployment | Docker Compose, startup/stop scripts | Local and production service orchestration |
| Testing | Pytest, pytest-asyncio, httpx ASGI tests | Backend unit and API test coverage |

Overall assessment: the codebase is organized, documented, and already shaped like a serious product handover. The largest near-term priorities are security hardening for candidate attempt routes, keeping frontend database schemas in sync with backend migrations, and applying a small readiness-check fix.

---

## 2. Source Package Summary

| Path / File | What it contains | Plain-English meaning |
| --- | --- | --- |
| `README.md` | Project summary, quick start, documentation links, hardware model table | The front door for anyone opening the project |
| `backend/` | FastAPI app, SQLAlchemy models, services, Alembic migrations, pytest tests | The engine room that processes files, talks to AI, stores data, and exposes APIs |
| `frontend/` | Next.js app, admin dashboard, candidate test UI, API clients, Prisma schema | The screens people use in the browser |
| `docs/` | User guide, developer guide, architecture guide, deployment guide, future improvements, changelog | Existing handover and support documentation |
| `docker-compose.yml` | Development stack: Postgres, backend, frontend, Mailpit, with native Ollama on host | Local development runtime |
| `docker-compose.prod.yml` | Production-oriented stack with Postgres, backend, frontend, and Ollama container | Server deployment starting point |
| `start.sh` | Hardware-aware launcher that selects Ollama model and question counts | One-command startup for development |
| `stop.sh` | Stops Docker services and native Ollama process | One-command shutdown |
| `backend/alembic/` | Versioned database migrations | The official database change history |
| `frontend/prisma/` | Prisma schema and initial migration | Frontend-side database schema for auth/server operations |

---

## 3. Application Architecture

### 3.1 High-Level Architecture

```text
Admin browser
    |
    | Login, dashboard, JD upload, test review, reports
    v
Next.js frontend
    |
    | /api/proxy adds X-Internal-Token on the server side
    v
FastAPI backend
    |            |              |             |
    |            |              |             |
PostgreSQL   Uploaded files   Ollama AI     Email service
database     local volume     local/model    Mailpit or Resend


Candidate browser
    |
    | Magic-link token, timed exam, autosave, submit
    v
FastAPI backend directly
```

### 3.2 What This Means for Non-Technical Readers

The system has two main doors:

| Door | Who uses it | What happens |
| --- | --- | --- |
| Admin door | Hiring admins | Login, upload job descriptions, generate tests, invite candidates, view reports |
| Candidate door | Job candidates | Open a secure link, take the test, submit answers |

The AI is not acting alone. The code has several control points:

| Control point | Why it matters |
| --- | --- |
| Admin approves generated tests before sending | Humans control what candidates see |
| AI output is validated before storage | Badly formatted AI responses are rejected or corrected |
| AI recommendation is preliminary | Hiring teams can override the recommendation |
| Question-level scoring can be adjusted | Admins can correct individual AI scores |

### 3.3 What This Means for Developers

The architecture uses a clear separation of responsibility:

| Area | Responsibility |
| --- | --- |
| Route files | Thin HTTP layer: parse request, call service, return response |
| Service files | Business logic: workflows, DB writes, AI orchestration |
| Schemas | Request, response, and AI-output validation |
| Models | Database structure and relationships |
| Frontend API clients | Typed calls from UI to FastAPI through proxy or direct candidate API |
| Docker/scripts | Runtime and deployment orchestration |

This is a good maintainability pattern because most behavior is testable without routing through browser pages.

---

## 4. Main User Journey

| Step | What the user sees | What the code does |
| --- | --- | --- |
| 1. Upload JD | Admin selects a PDF or DOCX file | Backend validates extension, size, and magic bytes, saves with UUID filename, creates a `job_descriptions` row |
| 2. Parse JD | Admin sees processing/ready status | Background task extracts text using PyMuPDF or python-docx and updates `parse_status` |
| 3. Analyze JD | Admin clicks analyze | Ollama extracts role title, seniority, skills, tools, responsibilities, topics, and difficulty distribution |
| 4. Generate tests | Admin starts generation and sees progress | Backend generates Technical, Reasoning, and Problem Solving tests using validated AI JSON |
| 5. Review tests | Admin edits or approves tests | Test metadata and questions can be updated, approved, archived, regenerated, or deleted |
| 6. Invite candidate | Admin enters candidate name/email | Backend creates candidate/invitation, stores HMAC token hash, sends raw token by email |
| 7. Candidate starts | Candidate opens magic link | Backend validates token, creates or resumes a `test_attempt`, strips correct answers |
| 8. Candidate answers | Timed exam with autosave | Frontend bulk-saves answers, syncs timer, logs tab/copy events |
| 9. Candidate submits | Completion page | Backend marks attempt submitted, stores final answers |
| 10. Evaluate | Admin triggers/views report | MCQs are auto-scored, written/code answers are AI-scored, report is stored |
| 11. Final decision | Admin reviews and can override | Admin override recommendation, notes, and per-question score overrides are saved |

---

## 5. Backend Analysis

### 5.1 Backend Folder Responsibilities

| Folder / File | Responsibility |
| --- | --- |
| `backend/app/main.py` | FastAPI app creation, middleware, lifespan startup/shutdown, router mounting |
| `backend/app/config.py` | Environment-based settings through `pydantic-settings` |
| `backend/app/dependencies.py` | Shared dependencies, especially internal API token verification |
| `backend/app/core/exceptions.py` | Standard application exceptions and JSON error responses |
| `backend/app/core/security.py` | Magic-link token generation, hashing, verification, expiry, link building |
| `backend/app/core/ratelimit.py` | Per-user/IP rate limiting for expensive routes |
| `backend/app/db/` | SQLAlchemy base, async engine, session factory, ORM models |
| `backend/app/schemas/` | Pydantic request/response models and strict AI-output schemas |
| `backend/app/services/` | Main business workflows and integrations |
| `backend/app/api/v1/` | API route definitions grouped by domain |
| `backend/alembic/` | Database migration environment and migration versions |
| `backend/tests/` | Backend tests using in-memory SQLite and ASGI test client |

### 5.2 API Endpoint Summary

| API group | Main routes | Purpose |
| --- | --- | --- |
| Health | `GET /api/v1/health`, `GET /api/v1/health/ready` | Liveness and dependency readiness checks |
| Job descriptions | Upload, list, detail, status, delete, analyze | Manage uploaded JDs and skill extraction |
| Tests | Generate, cancel, list, progress, detail, edit, approve, regenerate, delete | Manage AI-generated assessment tests |
| Invitations | Create, list by JD, validate token, resend, revoke | Candidate email invitations and magic-link flow |
| Attempts | Start/resume, state, save answer, bulk save, heartbeat, submit, log event | Candidate exam lifecycle |
| Evaluation | List, trigger, detail, summary, override, question-score override, export DOCX | AI grading and admin review |
| Leaderboards/reports | Global leaderboard, JD leaderboard, system report | Candidate comparison and aggregate analytics |
| Stats | Dashboard counts and recent completions | Admin dashboard cards and notification bell |

### 5.3 Key Backend Services

| Service | What it does |
| --- | --- |
| `file_service.py` | Saves, reads, deletes uploaded files, guards against path traversal |
| `parser_service.py` | Extracts clean text from PDF and DOCX content |
| `jd_service.py` | Creates JDs, manages parse/analyze/generate background tasks, lists and deletes JDs |
| `skill_extraction_service.py` | Builds skill-extraction prompts, validates AI JSON, saves extracted JD data |
| `test_generation_service.py` | Generates three test types, validates AI output, stores tests/questions, tracks progress |
| `test_service.py` | Lists tests, updates metadata, approves, regenerates, deletes tests/questions |
| `invitation_service.py` | Creates candidates/invitations, validates magic links, resends/revokes invitations |
| `attempt_service.py` | Starts/resumes tests, saves answers, handles heartbeat/timer, submits attempts, logs integrity events |
| `evaluation_service.py` | Scores MCQs, evaluates written/code answers with AI, creates reports and leaderboards |
| `ollama_service.py` | Persistent HTTP client, JSON extraction, retries, Ollama connectivity |
| `email_service.py` | Sends invitation emails through SMTP or Resend |
| `export_service.py` | Builds DOCX evaluation reports |

### 5.4 Backend Strengths

| Strength | Why it matters |
| --- | --- |
| Services are separated from route handlers | Easier to test and maintain |
| AI responses are validated before database writes | Reduces hallucinated or malformed data entering the system |
| Background tasks are used for long operations | Admin requests return quickly while parsing/generation continues |
| File uploads validate both extension and magic bytes | Better than trusting filename or browser MIME type |
| Candidate tokens are HMAC-hashed in storage | Raw magic links are not stored in the database |
| MCQ correct answers are stripped before candidate display | Protects test answers from candidate browser responses |
| Startup resets stuck generation states | Admins are not left with permanently spinning generation banners after crashes |
| Rate limiting targets expensive AI routes | Protects the system from repeated costly requests |
| Tests cover important backend flows | Uploads, parsing, security, invitations, attempts, generation, evaluation |

---

## 6. Frontend Analysis

### 6.1 Frontend Folder Responsibilities

| Folder / File | Responsibility |
| --- | --- |
| `frontend/src/app/` | Next.js App Router pages and API routes |
| `frontend/src/app/(admin)/dashboard/` | Protected admin dashboard pages |
| `frontend/src/app/(auth)/login/` | Admin login page |
| `frontend/src/app/test/` | Public candidate test pages |
| `frontend/src/app/api/proxy/[...path]/route.ts` | Authenticated server-side proxy to FastAPI |
| `frontend/src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler |
| `frontend/src/components/admin/` | Dashboard components such as upload form, invite form, test cards, question editor |
| `frontend/src/components/candidate/` | Candidate exam components for MCQ, open-ended, code, timer, progress, submit confirmation |
| `frontend/src/hooks/` | Candidate autosave, timer, and suspicious-event hooks |
| `frontend/src/lib/api/` | Typed API clients for backend communication |
| `frontend/src/lib/auth.ts` | NextAuth credentials provider and JWT/session callbacks |
| `frontend/src/types/` | TypeScript interfaces mirroring backend responses |
| `frontend/prisma/` | Prisma schema for server-side database access |

### 6.2 Important Frontend Routes

| Route | User | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page |
| `/login` | Admin | Credentials login |
| `/dashboard` | Admin | Overview and statistics |
| `/dashboard/jds` | Admin | List job descriptions |
| `/dashboard/jds/upload` | Admin | Upload a JD |
| `/dashboard/jds/[id]` | Admin | JD detail, skill extraction, generation controls |
| `/dashboard/jds/[id]/tests` | Admin | Tests for a JD |
| `/dashboard/jds/[id]/tests/[testId]` | Admin | Test editor and approval |
| `/dashboard/jds/[id]/invite` | Admin | Invite candidates |
| `/dashboard/jds/[id]/candidates` | Admin | Candidate invitation status |
| `/dashboard/results` | Admin | Results entry point |
| `/dashboard/results/[attemptId]` | Admin | Full evaluation report |
| `/dashboard/leaderboard` | Admin | Global leaderboard |
| `/dashboard/results/leaderboard/[jdId]` | Admin | Per-JD leaderboard |
| `/dashboard/results/report/[jdId]` | Admin | Aggregate system report for a JD |
| `/test/[token]` | Candidate | Magic-link landing/start page |
| `/test/[token]/exam` | Candidate | Timed test-taking interface |
| `/test/complete` | Candidate | Completion page |
| `/test/expired` | Candidate | Expired-link page |

### 6.3 Frontend Communication Pattern

| Caller | Path used | Security approach |
| --- | --- | --- |
| Admin browser | `/api/proxy/api/v1/...` | Next.js verifies NextAuth JWT and injects `X-Internal-Token` server-side |
| Server components | Direct FastAPI internal URL through `serverFetch` | Server-only helper adds `X-Internal-Token` |
| Candidate browser | Public FastAPI URL from `NEXT_PUBLIC_API_URL` | Candidate magic-link token and attempt token headers |

This is a good architecture because the internal backend secret is never placed in browser JavaScript.

### 6.4 Frontend Strengths

| Strength | Why it matters |
| --- | --- |
| Clear admin/candidate route separation | Admin auth and candidate magic links do not mix |
| Server components use native fetch helper | Allows Next.js caching and revalidation |
| Client-side admin calls go through proxy | Protects backend internal secret |
| Candidate autosave uses bulk endpoint | Reduces network and database load |
| Generation context persists job state in session storage | Admin can navigate while generation continues |
| Candidate UI includes timer, autosave, progress, and confirmation | Better candidate experience |
| Admin UI includes score overrides and DOCX export | Keeps humans in control of final hiring judgment |

---

## 7. Database and Data Model

### 7.1 Main Data Entities

| Table / Model | Plain-English meaning | Key relationships |
| --- | --- | --- |
| `users` | Admin accounts | Upload JDs and send invitations |
| `job_descriptions` | Uploaded job description files and extracted text | Has extracted data, tests, invitations |
| `jd_extracted_data` | AI-extracted role details | One record per JD |
| `tests` | Generated assessments | Belongs to a JD, has questions |
| `questions` | MCQ, open-ended, and code questions | Belongs to a test |
| `candidates` | People invited to take tests | Has invitations and attempts |
| `invitations` | Magic-link invitation to a candidate for a JD | Stores hashed token, expiry, status |
| `test_attempts` | One candidate taking one test | Has answers, suspicious events, evaluation |
| `candidate_answers` | Saved answers per question | Upserted during autosave |
| `suspicious_events` | Tab switch, copy, blur, and similar integrity logs | Belongs to an attempt |
| `evaluations` | Overall AI-assisted result for an attempt | Has question feedback |
| `question_feedback` | Per-question score and feedback | Links evaluation, question, and attempt |

### 7.2 Data Flow in One Line

```text
User uploads JD -> Extracted JD data -> Tests -> Questions -> Invitation -> Candidate attempt -> Answers -> Evaluation -> Report
```

### 7.3 Migration State

The backend uses Alembic and currently has migrations for:

| Migration | Purpose |
| --- | --- |
| `2b330cc211ed_initial_schema.py` | Creates the initial tables and indexes |
| `f3a9c1d2e4b5_add_admin_score_to_question_feedback.py` | Adds admin per-question score override |
| `c7e2d4f8a1b3_feature_evaluation_level_coding_passing_marks.py` | Adds evaluation level, improvement suggestions, suitable role, skill breakdown, passing marks, and coding question fields |

Important note: Alembic is the backend source of truth for schema changes. Prisma is present for frontend server/database use, especially auth. The Prisma schema should be kept aligned with Alembic whenever backend schema changes are added.

---

## 8. AI Pipeline Analysis

### 8.1 Skill Extraction

| Step | Behavior |
| --- | --- |
| Input | Raw JD text from PDF/DOCX parser |
| AI task | Extract title, seniority, must-have skills, nice-to-have skills, tools, responsibilities, topics, and difficulty distribution |
| Validation | Pydantic validates required fields and difficulty percentages summing to 100 |
| Retry | If AI output is invalid, backend sends a correction prompt |
| Storage | Validated result is stored in `jd_extracted_data` |

Plain-English explanation: the AI reads the job description and fills out a structured form. The backend checks that the form is complete before saving it.

### 8.2 Test Generation

| Step | Behavior |
| --- | --- |
| Input | Extracted JD data, selected difficulty distribution, configured question counts |
| Test types | Technical, Reasoning, Problem Solving |
| AI output | JSON containing test metadata, MCQs, and open-ended questions |
| Validation | MCQ option shape, correct answer consistency, marks, difficulty, and question counts are validated |
| Retry | Up to correction attempts for malformed AI output |
| Storage | Tests and questions are saved as draft |
| Admin control | Admin must review and approve before inviting candidates |

The generation service supports sequential or parallel AI generation depending on hardware. `start.sh` chooses model, question count, timeout, and sequential mode based on CPU/GPU capacity.

### 8.3 Candidate Evaluation

| Answer type | How it is graded |
| --- | --- |
| MCQ | Exact match against correct answer |
| Open-ended | Ollama evaluates answer against expected answer and rubric |
| Code | Backend has support for code-specific evaluation prompts |
| Final report | AI aggregates strengths, weaknesses, summary, recommendation, improvement suggestions, suitable role, and skill breakdown |

The recommendation is guarded by score thresholds:

| Score range | Recommendation |
| --- | --- |
| 80 percent and above | Strong Hire |
| 65 to 79 percent | Hire |
| 45 to 64 percent | Maybe |
| Below 45 percent | No Hire |

The backend enforces these thresholds after the AI response, which is important because the model may occasionally produce a recommendation that does not match the score.

---

## 9. Security Review

### 9.1 Security Features Already Present

| Area | Current behavior |
| --- | --- |
| Admin authentication | NextAuth credentials provider with bcryptjs password verification |
| Admin route protection | Next.js middleware redirects unauthenticated dashboard requests |
| Backend admin protection | FastAPI routes require `X-Internal-Token`, added only by the Next.js server/proxy |
| Candidate invitation token | Raw token is sent in email, HMAC hash is stored in database |
| Token comparison | Uses constant-time comparison |
| Link expiry | Invitation links expire, default 72 hours |
| Upload validation | Extension, file size, and magic bytes checked |
| File storage | UUID filenames and path traversal guard |
| Candidate test safety | Correct answers and rubrics are stripped from candidate responses |
| Rate limiting | Expensive upload/analyze/generate/evaluate routes are limited |
| Frontend security headers | Frame, content-type, referrer, and permissions headers configured |

### 9.2 Priority Security Hardening Item

The most important security improvement found in this review is in candidate attempt routes.

Current state:

| Route behavior | Observation |
| --- | --- |
| `/attempts/start` | Validates the raw magic-link token correctly |
| `/attempts/{id}/state` | Re-validates token ownership against the attempt |
| `/attempts/{id}/answer` | Requires an `X-Attempt-Token` header to exist, but the route does not pass the token into the service for ownership validation |
| `/attempts/{id}/bulk-save` | Same concern as answer save |
| `/attempts/{id}/heartbeat` | Same concern as answer save |
| `/attempts/{id}/submit` | Same concern as answer save |
| `/attempts/{id}/event` | Same concern as answer save |

Plain-English meaning: after the candidate starts a test, some later actions check that a token header is present, but not that the token truly belongs to that exact attempt. Attempt IDs are UUIDs and hard to guess, so this is not the same as having no protection. Still, the intended security design says each attempt action should verify both the attempt ID and its matching token.

Recommended fix:

1. Pass the token into `save_answer`, `bulk_save_answers`, `heartbeat`, `submit_attempt`, and `log_suspicious_event`.
2. Add one shared helper such as `_assert_token_owns_attempt(attempt, token, db)`.
3. Reuse the same ownership check already implemented in `get_attempt_state`.
4. Also validate that saved `question_id` values belong to the attempt's assigned test.

---

## 10. Deployment and Operations

### 10.1 Local Development Runtime

The local development setup uses:

| Service | How it runs locally |
| --- | --- |
| PostgreSQL | Docker container, host port `5434` |
| Backend | Docker container, host port `8000` |
| Frontend | Docker container, host port `3001` |
| Mailpit | Docker container, UI on `8026`, SMTP on `1026` |
| Ollama | Native host process, port `11434` |

The `start.sh` script:

1. Detects CPU, RAM, and NVIDIA GPU VRAM.
2. Chooses an Ollama model.
3. Chooses question counts and timeouts.
4. Writes `backend/.env.hardware`.
5. Starts Ollama if needed.
6. Pulls the chosen model if missing.
7. Starts Docker Compose.

The `stop.sh` script:

| Command | Result |
| --- | --- |
| `./stop.sh` | Stops services and preserves data |
| `./stop.sh --wipe-db` | Stops services and deletes Docker volumes |

### 10.2 Production Runtime

The production compose file uses:

| Service | Production behavior |
| --- | --- |
| PostgreSQL | Internal-only exposed port, persistent volume |
| Ollama | Containerized service with persistent model volume |
| Backend | FastAPI with production env, no source mount, two workers in compose override |
| Frontend | Production Next.js build, host port `3001` |
| Volumes | Database, Ollama models, and uploads persist |

Important operational note: local development runs Ollama natively for easier GPU access, while production compose includes an Ollama container. The deployment guide and server setup should be clear about which mode is used in the target environment.

### 10.3 Environment Files

| File | Purpose |
| --- | --- |
| `.env.example` | Root PostgreSQL and shared secret template |
| `backend/.env.example` | Backend database, security, CORS, Ollama, upload, email, and magic-link settings |
| `frontend/.env.local.example` | NextAuth, backend URLs, internal API secret, Prisma database URL |
| `backend/.env.hardware` | Auto-generated by `start.sh` |

Production must replace all sample secrets and passwords.

---

## 11. Testing and Quality

### 11.1 Backend Tests Found

The backend has meaningful pytest coverage across:

| Test file | Coverage area |
| --- | --- |
| `test_health.py` | Liveness/root/404 behavior |
| `test_parser.py` | PDF/DOCX parsing and text cleanup |
| `test_jd_upload.py` | Upload validation, list/detail/status/delete |
| `test_security.py` | Token generation, hashing, expiry, magic-link building |
| `test_invitations.py` | Invitation creation, duplicate prevention, token validation, expiry, listing |
| `test_attempts.py` | Start/resume, safe questions, saves, submit, suspicious events |
| `test_skill_extraction.py` | Skill extraction schema validation and retry behavior |
| `test_test_generation.py` | Generated test validation and persistence |
| `test_tests_api.py` | Test API behavior and validation |
| `test_evaluation.py` | MCQ scoring, AI schema validation, evaluation pipeline, overrides |
| `test_ollama_service.py` | JSON extraction, retry, ping/list behavior |

The tests use an in-memory SQLite database and patched services so they do not require real PostgreSQL, file I/O, or live Ollama for most cases.

### 11.2 Frontend Tests Found

No dedicated frontend test suite was found in the reviewed files. The frontend does include:

| Script | Purpose |
| --- | --- |
| `npm run build` | Production Next.js build |
| `npm run type-check` | TypeScript type checking |
| `npm run lint` | Linting script |

Recommended frontend quality additions:

1. Add a small Playwright smoke test for login, JD page load, and candidate exam start.
2. Add component tests for `JdUploadForm`, `InviteForm`, `QuestionEditor`, and candidate answer components.
3. Add a type-check job to CI once schema sync is fixed.

---

## 12. Challenges Faced During Development

This section explains the main practical challenges faced while building and running Talvyn. It is written for both technical and non-technical readers because these challenges affected both engineering decisions and day-to-day user experience.

### 12.1 Main AI and Hardware Challenges

The biggest challenge was not the normal website logic. The hardest part was running the AI model reliably on limited local hardware.

Important clarification: in this project, "AI model training" mostly means running, configuring, and tuning local AI model behavior through Ollama prompts, JSON validation, retries, model selection, and hardware settings. Full training or fine-tuning of a large language model would require much stronger hardware and was not realistic for the available machine.

| Challenge | Plain-English explanation | Technical impact | How it was handled |
| --- | --- | --- | --- |
| Limited GPU VRAM | The available GPU memory could not comfortably run the largest AI models | Larger Gemma models were slow or impossible to load; concurrent requests could run out of memory | `start.sh` detects hardware and selects a smaller model when needed |
| Slow AI generation | Creating three full tests through AI can take several minutes | Long HTTP requests risked timeout and poor user experience | Generation was moved to background tasks with polling/progress |
| AI queueing on low VRAM | When only one AI request can run at a time, parallel requests wait in a queue | The second or third request could timeout before generation even started | Low-VRAM profiles use sequential generation |
| Model quality vs speed tradeoff | Smaller models run faster but may produce weaker or malformed output | AI sometimes returned invalid JSON, wrong counts, weak explanations, or inconsistent difficulty labels | Pydantic validation, correction prompts, strict JSON mode, and repair logic were added |
| Running Ollama inside Docker locally | GPU passthrough can be difficult on consumer hardware and driver setups | Docker GPU access was less reliable than native Ollama | Development runs Ollama natively on the host; backend connects through `host.docker.internal` |
| Long model startup and download time | AI models are large and need to be pulled before use | First startup can be slow and confusing | `start.sh` checks model availability and pulls missing models |
| Hardware-specific test size | A small machine cannot generate/evaluate the same workload as a larger server | Too many questions can make generation very slow | Question counts are configured by hardware profile |
| Open-ended answer evaluation | Written answers require AI calls per answer | Evaluation can become slow when many open-ended/code answers exist | Open-ended and code evaluations are dispatched concurrently where possible |

### 12.2 Other Development Challenges

| Challenge | Why it mattered | Current handling |
| --- | --- | --- |
| Background task reliability | If the server stops mid-generation, the database can show a stuck status | Startup resets stuck `EXTRACTING` and `GENERATING` statuses to `FAILED` |
| Multi-worker progress tracking | Uvicorn workers do not share in-memory state | Test generation progress is stored in temporary progress files |
| File parsing | PDFs and DOCX files can be malformed, empty, or very large | Upload validation and parser error handling were added |
| Candidate autosave | Saving every answer individually creates unnecessary network/database load | Bulk autosave endpoint and frontend hook are used |
| Database performance | Candidate attempts, answers, invitations, and reports need fast lookups | Hot-path indexes were added |
| AI-generated content control | AI output cannot be trusted blindly | Admin review/approval and admin override features were added |
| Frontend/backend schema drift | Backend migrations evolved faster than Prisma/TypeScript schema | This is listed as a priority future improvement |
| Local email testing | Real candidate emails should not be sent during development | Mailpit captures development emails locally |

### 12.3 Lessons Learned

| Lesson | Practical meaning |
| --- | --- |
| Hardware-aware AI is necessary | The platform must adapt model size, question count, timeouts, and parallelism to the machine |
| AI output must be treated as untrusted input | Every AI response should be validated before entering the database |
| User feedback matters during long AI tasks | Progress banners and status polling make long generation feel understandable |
| Human control is essential | Admin approval, score override, and recommendation override keep the hiring decision responsible |
| Local development and production may need different AI setups | Native Ollama is easier locally; containerized Ollama may be better for controlled server deployment |

---

## 13. Improvements Already Made

Several improvements are already visible in the codebase and supporting documents. These are important because they show the project has already gone through performance and reliability work, not just first-pass feature building.

| Improvement | Problem it solved | Benefit |
| --- | --- | --- |
| Hardware auto-configuration in `start.sh` | Manual model selection was error-prone | The system chooses model, timeouts, question counts, and sequential/parallel mode automatically |
| Native Ollama in local development | Docker GPU passthrough was difficult on available hardware | Local AI runs more reliably with direct host access |
| Sequential generation for low VRAM | Parallel AI calls caused queue timeouts | Generation is slower but more reliable on small GPUs |
| Parallel generation for stronger hardware | Sequential generation wasted capable GPUs | Higher-end machines can generate tests faster |
| Background tasks for analysis/generation | Long AI calls could block admin requests | Admins get immediate feedback and can poll status |
| Persistent Ollama HTTP client | Creating a new HTTP client per AI call wasted resources | Reused connections reduce overhead |
| AI JSON validation and correction prompts | Models sometimes returned malformed output | Only validated skill/test/evaluation data is stored |
| Hot database indexes | Common lookups could become slow as data grows | JD, test, invitation, attempt, answer, and feedback lookups are faster |
| Bulk autosave | Candidate answers previously required many requests | Fewer requests and fewer database operations |
| PostgreSQL `ON CONFLICT` upsert | Answer saves used extra database round trips | Autosave is more efficient and atomic |
| Server-component `fetch` helper | Axios bypassed Next.js caching | Server pages can benefit from revalidation and request deduplication |
| Startup recovery for stuck jobs | Interrupted AI jobs could leave endless loading states | Failed jobs become retryable |
| DOCX export | Hiring teams need shareable reports | Evaluation reports can be exported for handover/review |

---

## 14. Future Improvements

The following improvements would make Talvyn stronger, faster, safer, and easier to operate in production.

### 14.1 AI and Hardware Improvements

| Priority | Improvement | Expected benefit |
| --- | --- | --- |
| High | Add a production hardware profile guide for 4 GB, 8 GB, 16 GB, and CPU-only servers | Clearer deployment planning and fewer surprise timeouts |
| High | Add a queue system for AI jobs, such as Redis Queue, Celery, Dramatiq, or another worker system | More reliable long-running AI tasks than FastAPI background tasks alone |
| High | Store AI job state in the database instead of temporary files | Better progress tracking across restarts and multiple containers |
| Medium | Add model quality presets, such as fast, balanced, and best quality | Admins can choose speed vs result quality |
| Medium | Add fallback behavior when Ollama is unavailable | Better user messages and retry options |
| Medium | Add prompt/version tracking for generated tests and evaluations | Easier debugging and audit trail when AI output changes |
| Medium | Consider cloud AI fallback for production if local hardware is too limited | More consistent generation times when local GPU is weak |
| Low | Explore fine-tuning only if enough data, GPU budget, privacy approval, and evaluation benchmarks exist | Potentially better domain-specific assessment quality |

### 14.2 Product and User Experience Improvements

| Priority | Improvement | Expected benefit |
| --- | --- | --- |
| High | Add a visible AI job history page | Admins can see past failures, retries, and durations |
| High | Add clearer failure messages for JD analysis and test generation | Non-technical users can understand what went wrong |
| Medium | Add candidate reminder emails before link expiry | Better completion rate |
| Medium | Add report filters by JD, test type, score range, and recommendation | Easier hiring review |
| Medium | Add manual question creation without AI | Admins can use the platform even when AI is unavailable |
| Medium | Add audit log for admin edits, overrides, and score changes | Better accountability |
| Low | Add CSV export for candidate lists and leaderboard data | Easier sharing with HR teams |

### 14.3 Engineering Improvements

| Priority | Improvement | Expected benefit |
| --- | --- | --- |
| High | Harden candidate attempt token ownership checks across save, heartbeat, submit, and event routes | Better security for public candidate endpoints |
| High | Verify saved question IDs belong to the candidate's assigned test | Prevents cross-attempt or cross-test answer injection |
| High | Sync Prisma schema and TypeScript types with backend Alembic/Pydantic schema | Reduces runtime/type mismatch risk |
| Medium | Fix readiness endpoint to return HTTP 503 when dependencies are degraded | More accurate health checks for deployment |
| Medium | Add frontend Playwright smoke tests | Protects core user flows from regressions |
| Medium | Add CI commands for backend tests, frontend type-check, and frontend build | Safer releases |
| Medium | Add structured production logging/monitoring dashboards | Faster issue diagnosis |
| Low | Add OpenAPI client generation for frontend types | Keeps frontend API types aligned automatically |

### 14.4 Operations and Deployment Improvements

| Priority | Improvement | Expected benefit |
| --- | --- | --- |
| High | Document final production choice: native Ollama vs containerized Ollama | Avoids confusion during deployment |
| High | Add backup and restore runbooks for database and uploads | Safer production operations |
| High | Add HTTPS/Nginx production checklist | Safer public deployment |
| Medium | Add resource monitoring for CPU, RAM, GPU VRAM, disk, and AI job duration | Easier capacity planning |
| Medium | Add database migration rollback notes | Safer schema changes |
| Medium | Add email provider verification checklist | Prevents failed candidate invitation delivery |

---

## 15. Findings and Recommendations

### 15.1 Summary of Strengths

| Area | Assessment |
| --- | --- |
| Overall structure | Clean separation between frontend, backend, docs, Docker, migrations, and tests |
| Documentation | Strong existing user, developer, architecture, deployment, changelog, and improvement docs |
| Backend architecture | Thin routes and service-driven business logic |
| AI safety | AI responses go through strict schemas and correction retries |
| Admin control | Tests require approval, evaluation can be overridden, scores can be adjusted |
| Candidate experience | Magic links, no account required, timer, autosave, resume, final submit |
| Operational tooling | `start.sh` and `stop.sh` make local operation approachable |
| Performance work | Existing docs show many bottleneck fixes already completed |

### 15.2 Priority Improvements

| Priority | Finding | Recommended action |
| --- | --- | --- |
| High | Candidate attempt routes do not consistently verify that `X-Attempt-Token` belongs to the attempt after `/state` | Pass token into all attempt service methods and enforce token-attempt ownership in one shared helper |
| High | Question save endpoints should verify that `question_id` belongs to the attempt's test | Reject answers for questions outside the assigned test |
| High | Prisma schema is behind backend Alembic/Pydantic schema for newer fields | Sync Prisma with backend schema, especially `CODE`, `GenerationStatus`, `passing_marks`, evaluation detail fields, and question feedback if Prisma will query them |
| Medium | `frontend/src/types/test.ts` and `frontend/src/types/index.ts` do not include `CODE` question type | Update frontend test types and question UI types to match backend support |
| Medium | Readiness endpoint computes degraded status code but does not apply it to the FastAPI response | Return a `JSONResponse` with 503 or inject `Response` and set `response.status_code` |
| Medium | Some documentation references older candidate route names such as `attempt/[token]` while current app uses `/test/[token]` | Update docs so handover users do not follow stale paths |
| Medium | Local and production Ollama deployment modes differ | Keep deployment instructions explicit about native Ollama versus containerized Ollama |
| Low | Backend docs mention some package versions that differ from `package.json` | Prefer package files as source of truth or update docs |
| Low | Frontend has no dedicated automated UI tests found | Add Playwright smoke tests for core workflows |

### 15.3 Production Readiness View

| Area | Status | Notes |
| --- | --- | --- |
| Core feature completeness | Strong | JD upload, AI generation, invitations, candidate tests, evaluation, reports are present |
| Developer handover | Strong | Existing docs and clear code organization help new developers |
| Security posture | Good with one important fix | Candidate attempt token ownership should be hardened |
| Database migration discipline | Good backend, needs frontend sync | Alembic is active; Prisma should be aligned |
| Operational scripts | Strong for local development | `start.sh` is unusually helpful |
| Production deployment | Usable starting point | Confirm secrets, HTTPS, backups, Ollama mode, and readiness checks |
| Test coverage | Good backend, limited frontend | Backend tests are broad; frontend tests should be added |

---

## 16. Handover Deliverables

| Deliverable | Status / Location |
| --- | --- |
| Source code | Project root, with backend and frontend folders |
| Backend API | `backend/app/api/v1/` |
| Backend business logic | `backend/app/services/` |
| Backend database models | `backend/app/db/models/` |
| Backend migrations | `backend/alembic/versions/` |
| Frontend pages | `frontend/src/app/` |
| Frontend components | `frontend/src/components/` |
| Frontend API clients | `frontend/src/lib/api/` |
| Prisma schema | `frontend/prisma/schema.prisma` |
| User guide | `docs/user-guide.md` |
| Developer guide | `docs/developer-guide.md` |
| Architecture guide | `docs/architecture.md` |
| Deployment guide | `docs/deployment.md` |
| Future improvements | `docs/future-improvements.md` |
| Startup script | `start.sh` |
| Shutdown script | `stop.sh` |
| Development compose | `docker-compose.yml` |
| Production compose | `docker-compose.prod.yml` |

---

## 17. Recommended Next Action Sequence

1. Fix candidate attempt token ownership checks across save, bulk-save, heartbeat, submit, and event routes.
2. Verify answer saves only accept question IDs from the attempt's assigned test.
3. Sync Prisma schema and TypeScript types with the latest backend migrations and schemas.
4. Fix readiness endpoint to return HTTP 503 when dependencies are degraded.
5. Run backend tests with `pytest`.
6. Run frontend `npm run type-check` and `npm run build`.
7. Update docs for current `/test/[token]` route names and current package versions.
8. Add a small frontend smoke-test suite for login, JD list/detail, candidate start, autosave, and result view.
9. Confirm production secrets, HTTPS, CORS, email provider, backups, and Ollama deployment mode.
10. Create a release checklist before handing to a production operator.

---

## 18. Friendly Glossary

| Term | Simple meaning |
| --- | --- |
| JD | Job description |
| API | A structured way for the frontend and backend to talk |
| Backend | The server-side application that handles data, files, AI, and rules |
| Frontend | The website screens users interact with |
| Database | The permanent memory of the platform |
| Migration | A versioned database change |
| Prisma | A TypeScript database client used by the frontend/server side |
| SQLAlchemy | A Python database toolkit used by the backend |
| FastAPI | The Python web framework used for the backend API |
| Next.js | The React framework used for the frontend |
| Ollama | Local AI model runtime used for skill extraction, test generation, and evaluation |
| Magic link | A secure link that lets a candidate open a test without creating a password |
| HMAC hash | A one-way protected version of a token stored in the database |
| Autosave | The system quietly saving candidate answers while they work |
| Preliminary AI assessment | A helpful AI recommendation that the admin can review, override, or correct |

---

## 19. Closing Assessment

Talvyn is more than a prototype. It has a coherent product flow, practical admin controls, strong backend organization, meaningful tests, and thoughtful operational scripts. The product story is easy to understand: upload a job description, generate controlled assessments, invite candidates, collect answers, and review AI-assisted reports.

The codebase is close to a handover-ready state, with a few important cleanup items before production confidence:

1. Harden candidate attempt token verification.
2. Sync frontend Prisma/TypeScript schema with backend migrations.
3. Correct readiness status behavior.
4. Add minimal frontend workflow tests.
5. Refresh small documentation drifts.

After those items, the platform should be much easier for both developers and non-technical operators to trust, maintain, and explain.
