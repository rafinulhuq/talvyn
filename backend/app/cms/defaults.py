"""Default CMP content used when no published database content exists."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

CmsDocumentKey = Literal["site", "home", "candidate_experience", "invitation_email"]

DOCUMENT_KEYS: tuple[str, ...] = (
    "site",
    "home",
    "candidate_experience",
    "invitation_email",
)

PUBLIC_DOCUMENT_KEYS: tuple[str, ...] = (
    "site",
    "home",
    "candidate_experience",
)

DEFAULT_SITE_CONTENT: dict[str, Any] = {
    "metadata": {
        "title": "Talvyn",
        "titleTemplate": "%s | Talvyn",
        "description": "AI-powered job description analysis and candidate assessment platform",
        "robotsIndex": False,
        "robotsFollow": False,
    },
    "brand": {
        "name": "Talvyn",
        "tagline": "AI-powered skills assessment for modern hiring teams.",
    },
    "navLinks": [
        {"label": "How it works", "href": "#how-it-works"},
        {"label": "Features", "href": "#features"},
        {"label": "Test types", "href": "#test-types"},
        {"label": "Testimonials", "href": "#testimonials"},
        {"label": "Blog", "href": "/blog"},
    ],
    "navActions": {
        "login": {"label": "Log in", "href": "/login"},
        "primary": {"label": "Try it free", "href": "/dashboard/jds/upload"},
    },
    "footerLinks": [
        {"label": "How it works", "href": "#how-it-works"},
        {"label": "Features", "href": "#features"},
        {"label": "Test types", "href": "#test-types"},
        {"label": "Blog", "href": "/blog"},
        {"label": "Log in", "href": "/login"},
    ],
    "footerCopyright": "© {year} Talvyn · Built with AI · All rights reserved",
}

DEFAULT_HOME_CONTENT: dict[str, Any] = {
    "sectionOrder": [
        "hero",
        "trustedBy",
        "stats",
        "howItWorks",
        "assessmentTypes",
        "features",
        "comparison",
        "testimonials",
        "blog",
        "finalCta",
    ],
    "hero": {
        "eyebrow": "Autonomous Technical Assessment Infrastructure",
        "titlePrefix": "Verify engineering judgment.",
        "titleHighlight": "Hire calibrated talent in 72 hours.",
        "body": (
            "Stop wasting engineering hours on generic take-homes and unverified resumes. "
            "Talvyn parses your role requirements, generates adaptive real-world work simulations, "
            "detects synthetic AI solutions with keystroke telemetry, and delivers ranked, blind-evaluated scorecards."
        ),
        "primaryCta": {"label": "Upload Job Spec (Free)", "href": "/dashboard/jds/upload"},
        "secondaryCta": {"label": "Explore Interactive Demo", "href": "#cockpit"},
        "helperText": "Zero setup required · Real-time anti-cheat telemetry · 10 free candidate evaluations",
    },
    "trustedBy": {
        "eyebrow": "Engineered for technical leaders & recruiting teams at",
        "companies": ["Linear", "Vercel", "Ramp", "Supabase", "Retool", "Temporal", "Datadog", "Brex"],
    },
    "stats": [
        {"value": "72 hrs", "label": "Average time from JD to verified shortlist", "icon": "zap"},
        {"value": "94.8%", "label": "Offer acceptance on top-ranked candidates", "icon": "trophy"},
        {"value": "0 false+", "label": "Integrity detection with keystroke dynamics", "icon": "shield"},
        {"value": "100%", "label": "Blind scoring across rubrics and competencies", "icon": "bar-chart"},
    ],
    "howItWorks": {
        "eyebrow": "Autonomous Evaluation Pipeline",
        "title": "From raw job specification to calibrated hires",
        "highlight": "in 4 autonomous stages",
        "body": (
            "Replace 30-day hiring slogs with deterministic skill benchmarks. "
            "From requirements ingestion to candidate ranking, your engineering team only interviews "
            "finalists who have already proven their domain competence."
        ),
        "steps": [
            {
                "step": "01",
                "title": "Ingest Role Architecture & Tech Stack",
                "body": "Upload your JD or system specifications. Talvyn's taxonomy engine parses core architectural requirements, seniority expectations, framework nuances, and required domain tradeoffs.",
                "icon": "file-text",
                "color": "blue",
            },
            {
                "step": "02",
                "title": "Synthesize Adaptive Multi-Modal Challenges",
                "body": "Generate targeted evaluations combining architectural trade-offs, live execution debugging, and scenario-based decision making tailored to your production stack.",
                "icon": "brain",
                "color": "purple",
            },
            {
                "step": "03",
                "title": "Discreet Candidate Cockpit & Anti-Cheat",
                "body": "Candidates complete the browser-based assessment in a focused IDE. Proprietary telemetry analyzes typing cadence, clipboard events, and window focus to eliminate copy-paste LLM exploitation.",
                "icon": "users",
                "color": "brand",
            },
            {
                "step": "04",
                "title": "Calibrated Scorecard & Decision Engine",
                "body": "Receive blind-graded candidate rankings backed by structured rubrics, code performance metrics, and actionable executive hiring recommendations.",
                "icon": "trophy",
                "color": "amber",
            },
        ],
        "media": {
            "type": "video",
            "src": "/videos/talvyn.mp4",
            "caption": "Talvyn 20-Second Platform Walkthrough",
        },
    },
    "assessmentTypes": {
        "eyebrow": "Tri-Vector Evaluation Engine",
        "title": "Three dimensions of capability,",
        "highlight": "zero guesswork",
        "body": "Modern software engineering cannot be measured by memorized algorithms alone. Talvyn evaluates candidates across architectural judgment, applied debugging, and operational decision-making.",
        "items": [
            {
                "icon": "code",
                "label": "System Architecture & Scalability",
                "color": "blue",
                "description": "High-signal challenges testing distributed systems design, data partitioning, caching strategies, and concurrency failure modes under real production loads.",
                "tags": ["Distributed Systems", "Data Modeling", "Failure Mode Analysis"],
            },
            {
                "icon": "brain",
                "label": "Applied Execution & Debugging",
                "color": "purple",
                "description": "Realistic codebases with pre-existing race conditions, memory leaks, and failing integration suites. Candidates refactor and resolve issues in real-time.",
                "tags": ["Root Cause Analysis", "Test Coverage", "Refactoring"],
            },
            {
                "icon": "target",
                "label": "Operational Judgment & Trade-offs",
                "color": "emerald",
                "description": "Scenario dilemmas testing production incident triaging, technical debt prioritization, latency vs cost trade-offs, and cross-functional communication.",
                "tags": ["Incident Response", "Cost Optimization", "Pragmatic Trade-offs"],
            },
        ],
    },
    "features": {
        "eyebrow": "Enterprise Hiring Infrastructure",
        "title": "Built for engineering orgs that",
        "highlight": "refuse to compromise on quality",
        "body": "Eliminate interview fatigue, accelerate calibration, and give every applicant a respectful, meritocratic screening experience.",
        "items": [
            {"icon": "sparkles", "title": "Dynamic Spec-Aware Generation", "body": "Never ask outdated or leaked questions. Assessments are dynamically constructed from your active stack requirements, ensuring complete relevance."},
            {"icon": "shield", "title": "Sub-second Behavioral Telemetry", "body": "Catch copy-paste prompts and synthetic answers with keystroke dynamics, cadence analysis, and focus tracking without invasive webcam spyware."},
            {"icon": "bar-chart", "title": "Standardized Rubric Scoring", "body": "Every written and coded response is evaluated against deterministic criteria derived from your engineering standard, eliminating reviewer mood variance."},
            {"icon": "trophy", "title": "Global Unified Talent Leaderboard", "body": "Stack-rank applicants across departments or cohorts. Compare percentile distributions, code cleanliness scores, and architecture scores at a glance."},
            {"icon": "file-text", "title": "Executive One-Pager Dossiers", "body": "Export comprehensive candidate briefs formatted for executive debriefs, including strengths, risk factors, and recommended live interview probes."},
            {"icon": "clock", "title": "Asynchronous Frictionless UX", "body": "No account signups or software installations required for candidates. Works instantly across all browsers with autosave and offline resilience."},
        ],
    },
    "comparison": {
        "eyebrow": "The Paradigm Shift",
        "title": "Why high-velocity teams abandon",
        "highlight": "legacy hiring",
        "oldLabel": "Status Quo (Take-Homes & LeetCode)",
        "newLabel": "Talvyn Calibration Engine",
        "rows": [
            {"label": "Engineering Time per Candidate", "old": "4 to 6 interviewer hours", "now": "0 hours (automated until final round)"},
            {"label": "Candidate Drop-off Rate", "old": "45% on multi-day take-homes", "now": "< 8% on 45-minute focused simulations"},
            {"label": "Susceptibility to AI Cheating", "old": "Defenseless against copy-paste LLMs", "now": "Real-time keystroke & cadence telemetry"},
            {"label": "Evaluation Consistency", "old": "Subjective gut-feel & mood swings", "now": "100% deterministic rubric scoring"},
            {"label": "Pedigree & Background Bias", "old": "Heavy school and big-tech bias", "now": "100% blind skill verification"},
            {"label": "Candidate Turnaround Velocity", "old": "2 to 3 weeks of scheduling friction", "now": "Instant scoring in 72 hours"},
        ],
    },
    "testimonials": {
        "eyebrow": "Verified Outcomes",
        "title": "What engineering leaders say about",
        "highlight": "Talvyn",
        "quotes": [
            {
                "text": "Our staff engineers were spending 15 hours a week grading take-homes and conducting screening calls. With Talvyn, our engineering team only meets candidates who have already proven they can ship production-grade code. It cut our time-to-offer by 65%.",
                "name": "Devin Vance",
                "role": "VP of Engineering, Apex Systems",
                "stars": 5,
                "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80",
                "videoUrl": "/videos/talvyn.mp4",
            },
            {
                "text": "In the age of LLMs, our previous take-home assignments were completely compromised — everyone submitted flawless GPT-4 code. Talvyn's telemetry and practical architectural scenarios are the only reason we can still hire remotely with confidence.",
                "name": "Elena Rostova",
                "role": "Head of Infrastructure, Helix Core",
                "stars": 5,
                "avatarUrl": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80",
            },
            {
                "text": "Candidates actually enjoy the process. We regularly receive notes praising how fair, relevant, and respectful the test was compared to memorizing binary search trees or doing unpaid weekend projects.",
                "name": "Kavita Chen",
                "role": "Director of Talent Acquisition, Pulse Scale",
                "stars": 5,
                "avatarUrl": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80",
            },
        ],
    },
    "blog": {
        "eyebrow": "Engineering & Hiring Intelligence",
        "title": "Perspectives on modern talent",
        "highlight": "assessment & verification",
        "body": "In-depth technical dispatches on keystroke dynamics, anti-cheat engineering, blind evaluation rubrics, and scaling high-velocity engineering organizations.",
        "ctaLabel": "Explore all engineering dispatches",
    },
    "finalCta": {
        "eyebrow": "Deploy Autonomous Screening Today",
        "title": "Stop screening resumes. Start hiring verified builders.",
        "body": "Upload your job specification and generate an enterprise evaluation suite in under three minutes. Zero credit card, zero setup friction.",
        "primaryCta": {"label": "Upload Job Specification (Free)", "href": "/dashboard/jds/upload"},
        "secondaryCta": {"label": "Explore Interactive Cockpit", "href": "#cockpit"},
        "helperText": "10 free candidate evaluations · Full rubric transparency · SOC-2 compliant practices",
    },
}

DEFAULT_CANDIDATE_EXPERIENCE_CONTENT: dict[str, Any] = {
    "invitationLanding": {
        "eyebrow": "Assessment Invitation",
        "greeting": "Hi {candidateName}, you've been invited to complete an online assessment.",
        "nextUpLabel": "Next up: test {current} of {total}",
        "whatYouWillCompleteLabel": "What you'll complete",
        "linkExpiryLabel": "Link expiry",
        "expiresInLabel": "Expires in {hours}h",
        "validUntilLabel": "Valid until {expiresAt}",
        "beforeYouBeginTitle": "Before you begin",
        "instructions": [
            "Find a quiet place with a stable internet connection.",
            "Each test is timed — the timer starts when you click Start.",
            "Your answers are saved automatically every 10 seconds.",
            "Do not refresh or navigate away — your progress may be lost.",
            "This link is personal and single-use.",
        ],
    },
    "sectionedExamLanding": {
        "sectionOverviewLabel": "This assessment has 3 sections, completed in order",
        "sectionMeta": "10 MCQ + 5 written",
        "instructions": [
            "Find a quiet place with a stable internet connection.",
            "Each section is timed — you'll complete them one after another.",
            "Your answers are saved automatically every 10 seconds.",
            "Once you submit a section, you cannot go back to it.",
            "Do not refresh or navigate away — your progress may be lost.",
            "This link is personal and single-use.",
        ],
    },
    "applyLanding": {
        "eyebrow": "Assessment Registration",
        "fallbackTitle": "Apply for this role",
        "body": "Enter your details below to receive your personal assessment link. Each candidate gets their own unique link — your progress is tracked separately from anyone else who applies here.",
        "whatYouWillCompleteLabel": "What you'll complete",
    },
    "invalidInvitation": {
        "expired": {
            "heading": "This link has expired",
            "body": "Assessment links are valid for 72 hours. Please contact the recruiter to request a new link.",
        },
        "already_used": {
            "heading": "This link has already been used",
            "body": "It looks like you have already submitted this assessment. Each link can only be used once.",
        },
        "revoked": {
            "heading": "This link has been revoked",
            "body": "This invitation link is no longer valid. Please contact the recruiter for more information.",
        },
        "terminated": {
            "heading": "Assessment ended",
            "body": "This assessment was ended because the exam window was left or another tab/window was opened. For fairness, remaining tests in this invitation are no longer available.",
        },
        "not_found": {
            "heading": "Invalid link",
            "body": "This link is invalid or has already been used. Please check your email for the correct link.",
        },
    },
    "invalidPublicLink": {
        "not_found": {
            "heading": "Link not found",
            "body": "This assessment link doesn't exist. Please check the URL or contact the recruiter.",
        },
        "disabled": {
            "heading": "This link is no longer active",
            "body": "The recruiter has disabled this assessment link. Please contact them for an updated link.",
        },
        "expired": {
            "heading": "This link has expired",
            "body": "This assessment link is no longer valid. Please contact the recruiter to request a new one.",
        },
        "no_tests": {
            "heading": "No assessment available yet",
            "body": "This role doesn't have an active assessment configured yet. Please check back later or contact the recruiter.",
        },
        "max_reached": {
            "heading": "Registration closed",
            "body": "This assessment link has reached its maximum number of registrations.",
        },
    },
    "completion": {
        "heading": "Assessment submitted",
        "body": "Your assessment has been received. The hiring team will review your responses and be in touch if you progress to the next stage.",
        "nextTitle": "What happens next?",
        "nextItems": [
            "Your answers are being reviewed by the hiring team.",
            "You may be contacted for a follow-up interview.",
            "This link cannot be used again.",
        ],
    },
    "expiredPage": {
        "heading": "This link has expired",
        "body": "Assessment links are valid for 72 hours after they are sent. This link is no longer active.",
        "nextTitle": "What should I do?",
        "nextBody": "Contact the recruiter or hiring team who sent you this assessment and ask them to send a new invitation. Each new link is valid for another 72 hours.",
    },
}

DEFAULT_INVITATION_EMAIL_CONTENT: dict[str, Any] = {
    "subject": "Your assessment invitation: {jdTitle}",
    "preheader": "You have been invited to complete an online assessment.",
    "heading": "You've been invited to take an assessment",
    "greeting": "Hi {candidateName},",
    "intro": "You have been invited to complete an online assessment for the {jdTitle} position.",
    "includedLabel": "What's included",
    "ctaLabel": "Start Your Assessment →",
    "expiryLabel": "Link expires:",
    "expiryBody": "This link can only be used once. Do not share it.",
    "fallbackLabel": "If the button above doesn't work, copy and paste this URL:",
    "instructions": "Before you start: Make sure you're in a quiet place with a stable internet connection. Each test is timed — once you begin, the timer cannot be paused.",
    "footer": "This invitation was sent by {invitedByName} via {platformName}. If you believe you received this in error, please ignore this email.",
}

DEFAULT_DOCUMENTS: dict[str, dict[str, Any]] = {
    "site": DEFAULT_SITE_CONTENT,
    "home": DEFAULT_HOME_CONTENT,
    "candidate_experience": DEFAULT_CANDIDATE_EXPERIENCE_CONTENT,
    "invitation_email": DEFAULT_INVITATION_EMAIL_CONTENT,
}


def default_for_key(key: str) -> dict[str, Any]:
    return deepcopy(DEFAULT_DOCUMENTS[key])
