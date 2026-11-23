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
        "description": "Turn a job description into a fair, timed skills assessment. Invite candidates, score their answers and compare them in one place.",
        "robotsIndex": False,
        "robotsFollow": False,
    },
    "brand": {
        "name": "Talvyn",
        "tagline": "Skills assessments built from your job descriptions.",
    },
    "navLinks": [
        {"label": "How it works", "href": "#how-it-works"},
        {"label": "What it tests", "href": "#test-types"},
        {"label": "Features", "href": "#features"},
        {"label": "Blog", "href": "/blog"},
    ],
    "navActions": {
        "login": {"label": "Sign in", "href": "/login"},
        "primary": {"label": "Request access", "href": "/signup"},
    },
    "footerLinks": [
        {"label": "How it works", "href": "#how-it-works"},
        {"label": "What it tests", "href": "#test-types"},
        {"label": "Features", "href": "#features"},
        {"label": "Blog", "href": "/blog"},
        {"label": "Sign in", "href": "/login"},
    ],
    "footerCopyright": "© {year} Talvyn. All rights reserved.",
}

# Only claims the product can back up. The logo strip, stats and testimonials
# are empty on purpose: the public site hides a section with nothing in it,
# so they appear once real customers, numbers and quotes are added in CMP.
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
        "eyebrow": "Skills assessment for hiring teams",
        "titlePrefix": "Turn a job description into a fair, timed assessment.",
        "titleHighlight": "",
        "body": "Upload the role, review the tests Talvyn writes from it, and invite candidates. Multiple-choice answers are marked instantly, written answers are scored against a rubric, and you make the final call with the evidence in front of you.",
        "primaryCta": {"label": "Request access", "href": "/signup"},
        "secondaryCta": {"label": "See how it works", "href": "#how-it-works"},
        "helperText": "The AI model runs on your own servers, so candidates' answers aren't sent to an outside AI provider.",
    },
    "trustedBy": {
        "eyebrow": "Used by hiring teams at",
        "companies": [],
    },
    "stats": [],
    "howItWorks": {
        "eyebrow": "How it works",
        "title": "From job description to shortlist",
        "highlight": "",
        "body": "Four steps, and you review each one before a candidate sees anything.",
        "steps": [
            {
                "step": "01",
                "title": "Add the role",
                "body": "Upload a PDF or Word job description, or write one from a short brief. Talvyn pulls out the skills, tools and seniority it asks for.",
                "icon": "file-text",
                "color": "blue",
            },
            {
                "step": "02",
                "title": "Review the tests",
                "body": "Three tests are written from those skills. Edit any question, set the time limit and pass mark, then approve them.",
                "icon": "brain",
                "color": "blue",
            },
            {
                "step": "03",
                "title": "Invite candidates",
                "body": "Send private links by email, upload a list, or share one public link. Candidates need no account, and their answers save as they type.",
                "icon": "users",
                "color": "blue",
            },
            {
                "step": "04",
                "title": "Compare and decide",
                "body": "Multiple choice is marked automatically and written answers are scored with feedback. Rank candidates, read every answer and record your decision.",
                "icon": "trophy",
                "color": "blue",
            },
        ],
        "media": None,
    },
    "assessmentTypes": {
        "eyebrow": "What it tests",
        "title": "Three tests for every role",
        "highlight": "",
        "body": "Each test mixes multiple-choice and written questions drawn from the role's own skills.",
        "items": [
            {
                "icon": "code",
                "label": "Technical",
                "color": "blue",
                "description": "Knowledge of the tools, languages and practices the role lists.",
                "tags": ["Role-specific tools", "Core concepts", "Practical scenarios"],
            },
            {
                "icon": "brain",
                "label": "Reasoning",
                "color": "blue",
                "description": "How candidates work through unfamiliar problems and explain their thinking.",
                "tags": ["Analysis", "Logic", "Written explanation"],
            },
            {
                "icon": "target",
                "label": "Problem solving",
                "color": "blue",
                "description": "Realistic situations from the job, and the trade-offs a good hire would weigh.",
                "tags": ["Scenarios", "Prioritising", "Judgement"],
            },
        ],
    },
    "features": {
        "eyebrow": "Features",
        "title": "What you get",
        "highlight": "",
        "body": "",
        "items": [
            {"icon": "sparkles", "title": "Tests from your own roles", "body": "Questions come from the skills in your job description, not a fixed library, and you can edit every one."},
            {"icon": "shield", "title": "Fair, timed sittings", "body": "A server-side timer, automatic saving, and copy and paste turned off. Leaving the test window ends the test, and the event is recorded."},
            {"icon": "bar-chart", "title": "Scoring with reasons", "body": "Written answers are scored against a rubric and show what was covered and what was missed, so you can check every score."},
            {"icon": "file-text", "title": "AI-writing estimates", "body": "Each written answer gets an estimate of how AI-like it reads. It prompts a conversation; it never rejects anyone on its own."},
            {"icon": "trophy", "title": "Reports and rankings", "body": "Rank candidates per role, compare scores by skill, and export a Word report for the hiring panel."},
            {"icon": "clock", "title": "Your servers, your data", "body": "The AI model runs on your own infrastructure, so candidates' answers don't go to an outside AI provider."},
        ],
    },
    "comparison": {
        "eyebrow": "Compared with take-home tasks",
        "title": "Why teams switch",
        "highlight": "",
        "oldLabel": "Take-home task",
        "newLabel": "Talvyn",
        "rows": [
            {"label": "Setting it up", "old": "Written and maintained by your own engineers", "now": "Written from the job description, then reviewed by you"},
            {"label": "Marking", "old": "Each reviewer marks differently", "now": "The same rubric for every candidate"},
            {"label": "Copying from AI tools", "old": "Hard to spot", "now": "Copy and paste blocked, plus an AI-writing estimate"},
            {"label": "Candidate's time", "old": "Often an evening or a weekend", "now": "One timed sitting, as long as you set it"},
        ],
    },
    "testimonials": {
        "eyebrow": "Customers",
        "title": "What hiring teams say",
        "highlight": "",
        "quotes": [],
    },
    "blog": {
        "eyebrow": "From the blog",
        "title": "Notes on hiring and assessment",
        "highlight": "",
        "body": "",
        "ctaLabel": "All posts",
    },
    "finalCta": {
        "eyebrow": "Get started",
        "title": "Run your next hiring round on Talvyn",
        "body": "Request an account. Once it's approved you can upload your first job description and invite candidates the same day.",
        "primaryCta": {"label": "Request access", "href": "/signup"},
        "secondaryCta": {"label": "Sign in", "href": "/login"},
        "helperText": "",
    },
}

DEFAULT_CANDIDATE_EXPERIENCE_CONTENT: dict[str, Any] = {
    "invitationLanding": {
        "eyebrow": "Assessment invitation",
        "greeting": "Hi {candidateName}, you've been invited to complete an online assessment.",
        "nextUpLabel": "Next up: test {current} of {total}",
        "whatYouWillCompleteLabel": "What you'll complete",
        "linkExpiryLabel": "Link expiry",
        "expiresInLabel": "Expires in {hours} hours",
        "validUntilLabel": "Valid until {expiresAt}",
        "beforeYouBeginTitle": "Before you begin",
        "instructions": [
            "Find a quiet place with a stable internet connection.",
            "Each test is timed. The timer starts when you press Start and can't be paused.",
            "Your answers save automatically as you work.",
            "Stay on this page. Switching tabs or windows ends the assessment.",
            "This link is personal. Don't share it.",
        ],
    },
    "sectionedExamLanding": {
        "sectionOverviewLabel": "Three sections, taken in order",
        "sectionMeta": "Timed",
        "instructions": [
            "Find a quiet place with a stable internet connection.",
            "Each section is timed, and you take them one after another.",
            "Your answers save automatically as you work.",
            "Once you submit a section, you can't go back to it.",
            "Stay on this page. Switching tabs or windows ends the assessment.",
            "This link is personal. Don't share it.",
        ],
    },
    "applyLanding": {
        "eyebrow": "Assessment registration",
        "fallbackTitle": "Apply for this role",
        "body": "Enter your details to start the assessment. Your progress is private to you.",
        "whatYouWillCompleteLabel": "What you'll complete",
    },
    "invalidInvitation": {
        "expired": {"heading": "This link has expired", "body": "Ask the person who invited you to send a new link."},
        "already_used": {"heading": "You've already finished this assessment", "body": "Each link works for one complete sitting. There's nothing more to do."},
        "revoked": {"heading": "This invitation was withdrawn", "body": "This link no longer works. Contact the person who invited you if you think that's a mistake."},
        "terminated": {
            "heading": "This assessment has ended",
            "body": "It ended because the assessment window was left. For fairness, the remaining tests in this invitation are closed.",
        },
        "not_found": {"heading": "This link doesn't work", "body": "Check that you opened the full link from your invitation email."},
    },
    "invalidPublicLink": {
        "not_found": {"heading": "This link doesn't exist", "body": "Check the address, or ask the recruiter for the right link."},
        "disabled": {"heading": "This assessment isn't open right now", "body": "The recruiter has paused it. Ask them when it reopens."},
        "expired": {"heading": "This assessment has closed", "body": "Its closing date has passed. Ask the recruiter about other openings."},
        "no_tests": {"heading": "No assessment is set up yet", "body": "This role doesn't have an assessment ready. Check back later."},
        "max_reached": {"heading": "Registration is full", "body": "This assessment has reached its limit of candidates."},
    },
    "completion": {
        "heading": "Assessment submitted",
        "body": "Your answers have been received. The hiring team will be in touch if you move to the next stage.",
        "nextTitle": "What happens next",
        "nextItems": [
            "The hiring team reviews your answers.",
            "You may be invited to a follow-up interview.",
            "This link can't be used again.",
        ],
    },
    "expiredPage": {
        "heading": "This link has expired",
        "body": "Invitation links work for a limited time, and this one is no longer active.",
        "nextTitle": "What to do",
        "nextBody": "Ask the person who invited you to send a new invitation.",
    },
}

DEFAULT_INVITATION_EMAIL_CONTENT: dict[str, Any] = {
    "subject": "Your assessment invitation: {jdTitle}",
    "preheader": "You have been invited to complete an online assessment.",
    "heading": "You've been invited to take an assessment",
    "greeting": "Hi {candidateName},",
    "intro": "You have been invited to complete an online assessment for the {jdTitle} position.",
    "includedLabel": "What's included",
    "ctaLabel": "Start your assessment",
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
