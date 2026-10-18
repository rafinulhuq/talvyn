"""
ATS Checker — deterministic resume/CV readability and completeness scoring.

Why deterministic and not a model call:
  An applicant tracking system is itself a parser, not a judge. It either
  finds an email address in the header or it doesn't; it either recognises
  "Work Experience" as a section heading or it doesn't. Modelling that with
  an LLM would make the score drift between runs on identical input, add an
  Ollama dependency to a check that must work offline, and make the whole
  thing effectively untestable. Every rule below is a plain heuristic over
  the extracted text, so `check_resume()` is a pure function: same text in,
  same report out.

Scoring shape:
  Six weighted categories summing to 100 when a JD is supplied. When no JD
  or keyword list is given, the keyword category reports max_score=0 and the
  overall score is normalised over the categories that actually applied, so
  a resume is never punished for a comparison the caller didn't ask for.

This module deliberately holds no DB or HTTP concerns — app/api/v1/ats.py
resolves the JD and hands the keywords in.
"""

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Literal

from app.schemas.ats import (
    ATSCategoryResult,
    ATSCheckResponse,
    ATSDetectedContact,
    ATSFinding,
    ATSKeywordMatch,
)

# ─── Category weights ────────────────────────────────────────
# These sum to 100. Parseability is weighted highest because a resume the
# parser can't read scores zero on every other axis in the real system,
# regardless of how good its content is.

WEIGHT_PARSEABILITY = 25.0
WEIGHT_CONTACT = 15.0
WEIGHT_SECTIONS = 20.0
WEIGHT_CONTENT = 20.0
WEIGHT_FORMATTING = 10.0
WEIGHT_KEYWORDS = 10.0

# Words per page for the page estimate. A typical single-column resume runs
# 450–550 words per page; 500 is the midpoint and only ever used for advice
# ("this is running long"), never for scoring precision.
WORDS_PER_PAGE = 500

# ─── Section vocabulary ──────────────────────────────────────
# Keyed by canonical section name; values are the heading spellings an ATS
# maps to that section. Ordered longest-first at match time so
# "professional experience" wins over a bare "experience".

SECTION_SYNONYMS: dict[str, tuple[str, ...]] = {
    "Experience": (
        "professional experience",
        "work experience",
        "employment history",
        "work history",
        "career history",
        "relevant experience",
        "experience",
        "employment",
    ),
    "Education": (
        "education and training",
        "academic background",
        "academic qualifications",
        "education",
        "academics",
        "qualifications",
    ),
    "Skills": (
        "technical skills",
        "core competencies",
        "areas of expertise",
        "skills and tools",
        "key skills",
        "technologies",
        "skills",
        "competencies",
        "expertise",
    ),
    "Summary": (
        "professional summary",
        "career objective",
        "personal statement",
        "summary of qualifications",
        "about me",
        "summary",
        "profile",
        "objective",
    ),
    "Projects": (
        "selected projects",
        "personal projects",
        "key projects",
        "projects",
        "portfolio",
    ),
    "Certifications": (
        "certifications and licenses",
        "certifications",
        "certificates",
        "licenses",
        "awards",
        "honors",
        "publications",
    ),
}

# Sections an ATS expects to find. Missing any of these is a real parsing
# problem, not a style preference.
REQUIRED_SECTIONS = ("Experience", "Education", "Skills")
# Sections that improve a profile but whose absence is advisory only.
RECOMMENDED_SECTIONS = ("Summary", "Projects", "Certifications")

# ─── Bullet + verb vocabulary ────────────────────────────────

# Characters a well-behaved resume uses to start a bullet. Anything outside
# this set (notably private-use-area glyphs from Wingdings/Symbol bullets)
# is what turns into mojibake or vanishes entirely on extraction.
SAFE_BULLET_CHARS = "-*•·‣◦–—>"

ACTION_VERBS: frozenset[str] = frozenset(
    """
    accelerated achieved acquired adapted addressed administered advanced advised
    analyzed architected assembled assessed audited authored automated balanced
    budgeted built centralized chaired coached collaborated compiled completed
    composed computed conceived conducted configured consolidated constructed
    consulted converted coordinated created cultivated customized cut debugged
    decreased defined delivered demonstrated deployed designed developed devised
    diagnosed directed documented doubled drafted drove earned edited eliminated
    enabled engineered enhanced established evaluated examined executed expanded
    expedited facilitated forecasted formulated founded generated grew guided
    handled headed identified implemented improved increased influenced initiated
    innovated inspected installed instituted integrated introduced invented
    investigated launched led leveraged maintained managed mapped marketed
    maximized measured mentored migrated minimized modeled modernized monitored
    negotiated operated optimized orchestrated organized overhauled oversaw
    performed pioneered planned prepared presented prioritized processed produced
    programmed promoted proposed prototyped provisioned published quantified
    reached rebuilt received recommended reconciled recruited redesigned reduced
    refactored refined removed reorganized reported researched resolved restored
    restructured revamped reviewed revised saved scaled scheduled secured selected
    shipped simplified solved sourced spearheaded standardized streamlined
    strengthened structured supervised supported surveyed sustained synthesized
    tested tracked trained transformed translated tripled troubleshot unified
    upgraded validated verified wrote
    """.split()
)

# Openers that describe a job description rather than an accomplishment.
WEAK_OPENERS: tuple[str, ...] = (
    "responsible for",
    "duties included",
    "tasked with",
    "worked on",
    "worked with",
    "helped with",
    "helped to",
    "assisted with",
    "in charge of",
    "involved in",
    "participated in",
)

# ─── Regexes ─────────────────────────────────────────────────

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# Deliberately permissive: an ATS is trying to find *a* phone number, not
# validate one. Requires at least 7 digits so version strings and dates
# ("2019 - 2021") don't register as phone numbers.
PHONE_RE = re.compile(
    r"(?:(?<=\s)|^|(?<=[:|(]))"
    r"(\+?\d{1,3}[\s.\-]?)?"
    r"(\(?\d{2,4}\)?[\s.\-]?)"
    r"\d{3}[\s.\-]?\d{2,4}(?:[\s.\-]?\d{0,4})"
)
URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>\"')]+|(?:linkedin\.com|github\.com|gitlab\.com)/[^\s<>\"')]+", re.I)
# "City, ST" or "City, Country" — the two shapes resume headers actually use.
# Horizontal whitespace only: \s would let the city half run backwards across
# a line break and swallow the name line above it ("Priya Raman\nBangalore").
LOCATION_RE = re.compile(
    r"\b([A-Z][a-zA-Z.\-']{2,}(?:[ \t][A-Z][a-zA-Z.\-']{1,}){0,2}),[ \t]*"
    r"([A-Z]{2}\b|[A-Z][a-zA-Z.\-']{2,})"
)
YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
DATE_RANGE_RE = re.compile(
    r"(?:"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(?:19|20)\d{2}"
    r"|\b\d{1,2}[/-](?:19|20)\d{2}\b"
    r"|\b(?:19|20)\d{2}\b"
    r")"
    r"\s*(?:-|–|—|to|until|through)\s*"
    r"(?:present|current|now|today"
    r"|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(?:19|20)\d{2}"
    r"|\b\d{1,2}[/-](?:19|20)\d{2}\b"
    r"|\b(?:19|20)\d{2}\b)",
    re.I,
)
PERCENT_OR_MONEY_RE = re.compile(r"\d\s*%|%\s*\d|[$€£¥]\s?\d|\b\d+(?:\.\d+)?\s?(?:k|m|bn|b)\b", re.I)
FIRST_PERSON_RE = re.compile(r"\b(?:I|I'm|I've|my|me|mine)\b")
# Unicode private-use area — where Wingdings/Symbol-font bullets live. These
# survive extraction as unmappable glyphs and are the classic sign of a
# resume built with decorative bullets.
PUA_RE = re.compile(r"[\ue000-\uf8ff]")
REPLACEMENT_CHAR_RE = re.compile(r"\ufffd")


@dataclass
class _Doc:
    """Pre-computed views of the resume text, built once and shared by every check."""

    text: str
    lines: list[str]
    non_empty_lines: list[str]
    lower: str
    words: list[str]
    bullets: list[str]
    header: str  # first ~15 non-empty lines, where contact details live
    header_lines: list[str] = field(default_factory=list)
    headings: dict[str, str] = field(default_factory=dict)


def _build_doc(text: str) -> _Doc:
    lines = text.splitlines()
    non_empty = [ln.strip() for ln in lines if ln.strip()]
    bullets = [ln for ln in non_empty if _is_bullet(ln)]
    return _Doc(
        text=text,
        lines=lines,
        non_empty_lines=non_empty,
        lower=text.lower(),
        words=text.split(),
        bullets=bullets,
            header_lines=non_empty[:15],
        header="\n".join(non_empty[:15]),
    )


def _is_bullet(line: str) -> bool:
    if not line:
        return False
    first = line[0]
    if first in SAFE_BULLET_CHARS or PUA_RE.match(first):
        return True
    # "1. Did the thing" / "1) Did the thing"
    return bool(re.match(r"^\d{1,2}[.)]\s+\S", line))


def _strip_bullet(line: str) -> str:
    stripped = line.lstrip(SAFE_BULLET_CHARS + " \t")
    stripped = PUA_RE.sub("", stripped).strip()
    return re.sub(r"^\d{1,2}[.)]\s+", "", stripped).strip()


def _normalize_heading(line: str) -> str:
    """Reduce a candidate heading line to comparable words."""
    cleaned = re.sub(r"[^a-z\s&]", " ", line.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _detect_sections(doc: _Doc) -> tuple[dict[str, str], set[str]]:
    """
    Return (canonical section -> the heading line that matched, inline-only names).

    A section counts as *detected* only when its name appears as a standalone
    short line. That mirrors how ATS parsers segment a resume: they look for
    heading lines, not for the word "education" buried in a sentence. Names
    that appear only inline are reported separately so the finding can say
    "you mention Skills but never as a heading" rather than "missing".
    """
    found: dict[str, str] = {}
    for raw in doc.non_empty_lines:
        # Headings are short. 60 chars comfortably covers "Professional
        # Experience & Selected Projects" while excluding prose sentences.
        if len(raw) > 60:
            continue
        normalized = _normalize_heading(raw)
        if not normalized:
            continue
        for canonical, synonyms in SECTION_SYNONYMS.items():
            if canonical in found:
                continue
            for synonym in sorted(synonyms, key=len, reverse=True):
                if normalized == synonym or normalized.startswith(synonym + " "):
                    found[canonical] = raw.strip()
                    break

    inline_only: set[str] = set()
    for canonical, synonyms in SECTION_SYNONYMS.items():
        if canonical in found:
            continue
        if any(syn in doc.lower for syn in synonyms):
            inline_only.add(canonical)
    return found, inline_only


# ─── Category checks ─────────────────────────────────────────
# Each returns (score, findings, summary). Scores are clamped at the
# category weight and never go below zero.


def _clamp(value: float, maximum: float) -> float:
    return max(0.0, min(round(value, 2), maximum))


def _summary_for(score: float, maximum: float, strong: str, partial: str, weak: str) -> str:
    """
    Three-way category label. A category carrying one advisory finding is not
    in the same state as one that failed outright, and collapsing both into a
    single "problems detected" label overstates the first.
    """
    ratio = score / maximum if maximum else 0.0
    if ratio >= 0.85:
        return strong
    if ratio >= 0.6:
        return partial
    return weak


def _check_parseability(
    doc: _Doc, extraction_method: Literal["native", "ocr"] | None
) -> tuple[float, list[ATSFinding], str]:
    score = WEIGHT_PARSEABILITY
    findings: list[ATSFinding] = []
    word_count = len(doc.words)

    if extraction_method == "ocr":
        score -= 15
        findings.append(
            ATSFinding(
                category="parseability",
                severity="CRITICAL",
                message="This file had no embedded text layer — the text had to be read with OCR.",
                suggestion=(
                    "Export the resume to PDF directly from your word processor instead of "
                    "scanning or screenshotting it. Most ATS parsers read a scanned resume as "
                    "a blank document."
                ),
            )
        )

    if word_count < 150:
        score -= 15
        findings.append(
            ATSFinding(
                category="parseability",
                severity="CRITICAL",
                message=f"Only {word_count} words of text were recovered.",
                suggestion=(
                    "Either the resume is very short or its content sits inside images, "
                    "text boxes, or a graphics layer the parser can't reach. Move all content "
                    "into plain document body text."
                ),
            )
        )
    elif word_count < 300:
        score -= 7
        findings.append(
            ATSFinding(
                category="parseability",
                severity="WARNING",
                message=f"The resume is quite thin at {word_count} words.",
                suggestion="Aim for 400–800 words so there is enough detail for keyword matching.",
            )
        )
    elif word_count > 1500:
        score -= 5
        findings.append(
            ATSFinding(
                category="parseability",
                severity="WARNING",
                message=f"The resume is long at {word_count} words (~{word_count / WORDS_PER_PAGE:.1f} pages).",
                suggestion="Trim to 1–2 pages. Recruiters filter on the first page and rarely scroll past the second.",
            )
        )

    # Text made mostly of symbols and stray characters means the extractor
    # recovered layout artefacts rather than readable content.
    alnum = sum(1 for ch in doc.text if ch.isalnum() or ch.isspace())
    if doc.text and alnum / len(doc.text) < 0.75:
        score -= 6
        findings.append(
            ATSFinding(
                category="parseability",
                severity="WARNING",
                message="A large share of the extracted text is punctuation or symbols rather than words.",
                suggestion=(
                    "This usually comes from decorative dividers, icon fonts, or a heavily "
                    "styled template. Rebuild on a plain single-column layout."
                ),
            )
        )

    # Heavy line fragmentation is the signature of a multi-column layout: the
    # parser reads across columns and emits many one- or two-word lines.
    if len(doc.non_empty_lines) >= 25:
        avg_words_per_line = word_count / len(doc.non_empty_lines)
        if avg_words_per_line < 3.0:
            score -= 6
            findings.append(
                ATSFinding(
                    category="parseability",
                    severity="WARNING",
                    message=(
                        f"Text is heavily fragmented (~{avg_words_per_line:.1f} words per line), "
                        "which is what a multi-column or text-box layout looks like after parsing."
                    ),
                    suggestion=(
                        "Use a single-column layout. Sidebars and two-column templates get "
                        "interleaved into nonsense by most parsers."
                    ),
                )
            )

    if REPLACEMENT_CHAR_RE.search(doc.text):
        score -= 4
        findings.append(
            ATSFinding(
                category="parseability",
                severity="WARNING",
                message="The extracted text contains unreadable replacement characters.",
                suggestion="Re-export the file with a standard font (Arial, Calibri, Georgia) embedded.",
            )
        )

    if not findings:
        findings.append(
            ATSFinding(
                category="parseability",
                severity="GOOD",
                message=f"Text extracted cleanly — {word_count} words in a readable, linear layout.",
            )
        )

    summary = _summary_for(
        score,
        WEIGHT_PARSEABILITY,
        "Reads cleanly",
        "Readable with caveats",
        "Parsing problems detected",
    )
    return _clamp(score, WEIGHT_PARSEABILITY), findings, summary


def _check_contact(doc: _Doc) -> tuple[float, list[ATSFinding], str, ATSDetectedContact]:
    findings: list[ATSFinding] = []
    score = 0.0

    email_match = EMAIL_RE.search(doc.text)
    phone_match = PHONE_RE.search(doc.text)
    # Matched per line rather than over the joined header: a location is a
    # single line's worth of text, and searching across line breaks lets the
    # name line above bleed into the "city" half of the match.
    location_match = next(
        (m for m in (LOCATION_RE.search(line) for line in doc.header_lines) if m),
        None,
    )
    links = []
    seen_links: set[str] = set()
    for raw_link in URL_RE.findall(doc.text):
        link = raw_link.rstrip(".,;)")
        key = link.lower()
        if key not in seen_links:
            seen_links.add(key)
            links.append(link)

    if email_match:
        score += 6
    else:
        findings.append(
            ATSFinding(
                category="contact",
                severity="CRITICAL",
                message="No email address was found.",
                suggestion=(
                    "Put a plain-text email address in the top section. An address that lives "
                    "only inside a header, footer, or icon graphic is invisible to most parsers."
                ),
            )
        )

    if phone_match:
        score += 4
    else:
        findings.append(
            ATSFinding(
                category="contact",
                severity="WARNING",
                message="No phone number was found.",
                suggestion="Add a phone number in plain text near your name, with the country code if you're applying internationally.",
            )
        )

    if location_match:
        score += 2
    else:
        findings.append(
            ATSFinding(
                category="contact",
                severity="INFO",
                message="No city/region was found in the header.",
                suggestion='Add a "City, Country" line — many ATS filters rank or route by location.',
            )
        )

    professional_links = [
        link for link in links if re.search(r"linkedin\.com|github\.com|gitlab\.com", link, re.I)
    ]
    if professional_links:
        score += 3
    elif links:
        score += 1
        findings.append(
            ATSFinding(
                category="contact",
                severity="INFO",
                message="No LinkedIn or GitHub profile was found, though other links are present.",
                suggestion="Add your LinkedIn URL — recruiters commonly use it to verify a profile before responding.",
            )
        )
    else:
        findings.append(
            ATSFinding(
                category="contact",
                severity="WARNING",
                message="No professional profile links were found.",
                suggestion="Add a LinkedIn URL, and a GitHub or portfolio link for technical roles.",
            )
        )

    if score == WEIGHT_CONTACT:
        findings.append(
            ATSFinding(
                category="contact",
                severity="GOOD",
                message="Email, phone, location, and a professional profile are all machine-readable.",
            )
        )

    detected = ATSDetectedContact(
        email=email_match.group(0) if email_match else None,
        phone=phone_match.group(0).strip() if phone_match else None,
        location=location_match.group(0) if location_match else None,
        links=links[:10],
    )
    summary = _summary_for(
        score, WEIGHT_CONTACT, "Complete and parseable", "Partially complete", "Missing contact details"
    )
    return _clamp(score, WEIGHT_CONTACT), findings, summary, detected


def _check_sections(doc: _Doc) -> tuple[float, list[ATSFinding], str, list[str], list[str]]:
    found, inline_only = _detect_sections(doc)
    doc.headings = found
    findings: list[ATSFinding] = []
    score = 0.0

    # Required sections carry most of the weight: 5 each for Experience and
    # Skills, 5 for Education (15 of 20), with 5 spread across recommended.
    required_points = {"Experience": 5.0, "Education": 5.0, "Skills": 5.0}
    for name, points in required_points.items():
        if name in found:
            score += points
            continue
        if name in inline_only:
            score += points / 2
            findings.append(
                ATSFinding(
                    category="sections",
                    severity="WARNING",
                    message=f'"{name}" content appears in the text but never as a standalone heading.',
                    suggestion=(
                        f'Add a plain "{name}" heading on its own line. Parsers segment a resume '
                        "by heading lines; content under an unlabelled block often gets dropped."
                    ),
                )
            )
        else:
            findings.append(
                ATSFinding(
                    category="sections",
                    severity="CRITICAL",
                    message=f"No {name} section was found.",
                    suggestion=f'Add a conventional "{name}" heading — it is one of the sections every ATS looks for first.',
                )
            )

    present_recommended = [name for name in RECOMMENDED_SECTIONS if name in found]
    # 5 points spread across the recommended sections, capped — having all
    # three is not three times better than having two.
    score += min(5.0, len(present_recommended) * 2.5)
    if not present_recommended:
        findings.append(
            ATSFinding(
                category="sections",
                severity="INFO",
                message="No Summary, Projects, or Certifications section was found.",
                suggestion=(
                    "Add a short professional summary at the top — it is the first thing a "
                    "recruiter reads and a cheap place to surface your headline keywords."
                ),
            )
        )

    detected = list(found.keys())
    missing = [
        name
        for name in (*REQUIRED_SECTIONS, *RECOMMENDED_SECTIONS)
        if name not in found
    ]

    if not missing:
        findings.append(
            ATSFinding(
                category="sections",
                severity="GOOD",
                message="Every conventional resume section was found with a recognisable heading.",
            )
        )

    summary = _summary_for(
        score, WEIGHT_SECTIONS, "Well structured", "Mostly structured", "Sections missing or unlabelled"
    )
    return _clamp(score, WEIGHT_SECTIONS), findings, summary, detected, missing


def _is_quantified(sentence: str) -> bool:
    """A bullet counts as quantified if it carries a metric, not just a date."""
    if PERCENT_OR_MONEY_RE.search(sentence):
        return True
    # Strip years so "Engineer, 2019 - 2021" isn't mistaken for a result.
    without_years = YEAR_RE.sub(" ", sentence)
    return bool(re.search(r"\d", without_years))


def _check_content(doc: _Doc) -> tuple[float, list[ATSFinding], str]:
    findings: list[ATSFinding] = []
    score = 0.0
    bullets = doc.bullets

    if not bullets:
        findings.append(
            ATSFinding(
                category="content",
                severity="WARNING",
                message="No bullet points were found — the experience reads as prose blocks.",
                suggestion=(
                    "Break each role into 3–5 bullets. Prose paragraphs are harder for both "
                    "parsers and recruiters to skim, and they bury your achievements."
                ),
            )
        )
    else:
        bodies = [_strip_bullet(b) for b in bullets]
        bodies = [b for b in bodies if b]

        # ── Quantified achievements (7 points) ──
        quantified = sum(1 for b in bodies if _is_quantified(b))
        ratio = quantified / len(bodies) if bodies else 0.0
        score += min(7.0, ratio * 14)  # 50% quantified earns full marks
        if ratio < 0.2:
            findings.append(
                ATSFinding(
                    category="content",
                    severity="WARNING",
                    message=f"Only {quantified} of {len(bodies)} bullets contain a number or metric.",
                    suggestion=(
                        'Quantify outcomes: "Cut p95 latency from 800ms to 120ms" beats '
                        '"Improved performance". Aim for a metric in at least half your bullets.'
                    ),
                )
            )
        elif ratio >= 0.5:
            findings.append(
                ATSFinding(
                    category="content",
                    severity="GOOD",
                    message=f"{quantified} of {len(bodies)} bullets are backed by a concrete number.",
                )
            )

        # ── Strong openers (6 points) ──
        strong = 0
        weak = 0
        for body in bodies:
            lowered = body.lower()
            if any(lowered.startswith(opener) for opener in WEAK_OPENERS):
                weak += 1
                continue
            first_word = re.split(r"[^a-z]+", lowered.lstrip(), maxsplit=1)[0]
            if first_word in ACTION_VERBS:
                strong += 1
        strong_ratio = strong / len(bodies) if bodies else 0.0
        score += min(6.0, strong_ratio * 10)  # 60% strong openers earns full marks
        if weak:
            findings.append(
                ATSFinding(
                    category="content",
                    severity="WARNING",
                    message=f'{weak} bullet(s) open with filler like "Responsible for" or "Worked on".',
                    suggestion='Start every bullet with a past-tense action verb — "Built", "Migrated", "Reduced".',
                )
            )
        elif strong_ratio < 0.4:
            findings.append(
                ATSFinding(
                    category="content",
                    severity="INFO",
                    message=f"Only {strong} of {len(bodies)} bullets start with a strong action verb.",
                    suggestion='Lead with the verb: "Automated the release pipeline", not "The release pipeline was automated".',
                )
            )

        # ── Bullet length sanity (2 points) ──
        overlong = sum(1 for b in bodies if len(b.split()) > 45)
        if overlong == 0:
            score += 2
        else:
            findings.append(
                ATSFinding(
                    category="content",
                    severity="INFO",
                    message=f"{overlong} bullet(s) run longer than 45 words.",
                    suggestion="Keep bullets to one or two lines. Split anything longer into separate points.",
                )
            )

    # ── Parseable date ranges (5 points) ──
    date_ranges = len(DATE_RANGE_RE.findall(doc.text))
    if date_ranges >= 2:
        score += 5
    elif date_ranges == 1:
        score += 2.5
        findings.append(
            ATSFinding(
                category="content",
                severity="WARNING",
                message="Only one employment date range could be parsed.",
                suggestion='Give every role an explicit range like "Mar 2021 – Present" so the ATS can compute your tenure.',
            )
        )
    else:
        findings.append(
            ATSFinding(
                category="content",
                severity="CRITICAL",
                message="No employment date ranges could be parsed.",
                suggestion=(
                    'Use a conventional format for every role — "Jan 2020 – Mar 2023" or '
                    '"01/2020 – 03/2023". Many ATS filters rank on years of experience computed '
                    "from these ranges, and an unparseable resume scores zero."
                ),
            )
        )

    # ── First-person voice (advisory only, no deduction below full marks) ──
    first_person = len(FIRST_PERSON_RE.findall(doc.text))
    if first_person > 8:
        findings.append(
            ATSFinding(
                category="content",
                severity="INFO",
                message=f'The resume uses first-person wording {first_person} times ("I", "my").',
                suggestion='Drop the pronouns — "Led a team of six" rather than "I led a team of six".',
            )
        )

    summary = _summary_for(
        score, WEIGHT_CONTENT, "Strong, evidence-backed writing", "Reasonable, could be sharper", "Content needs sharpening"
    )
    return _clamp(score, WEIGHT_CONTENT), findings, summary


def _check_formatting(doc: _Doc, filename: str | None) -> tuple[float, list[ATSFinding], str]:
    findings: list[ATSFinding] = []
    score = WEIGHT_FORMATTING

    # ── Tables / column alignment ──
    pipe_lines = sum(1 for ln in doc.non_empty_lines if ln.count("|") >= 2)
    tab_lines = sum(1 for ln in doc.lines if "\t" in ln)
    gap_lines = sum(1 for ln in doc.non_empty_lines if re.search(r"\S {4,}\S", ln))
    table_like = pipe_lines + tab_lines + gap_lines
    # Three rows is already a table. The earlier threshold of five let a
    # three-row "skills grid" — the most common ATS-hostile table on a
    # resume — through with full marks.
    if table_like >= 3:
        score -= 3
        findings.append(
            ATSFinding(
                category="formatting",
                severity="WARNING",
                message=f"{table_like} line(s) look like table or column layout.",
                suggestion=(
                    "Replace tables with plain headings and bullets. Table cells are commonly "
                    "read out of order, so a skills grid can arrive scrambled."
                ),
            )
        )

    # ── Decorative bullet glyphs ──
    if PUA_RE.search(doc.text):
        score -= 3
        findings.append(
            ATSFinding(
                category="formatting",
                severity="WARNING",
                message="Symbol-font bullets or icons were detected in the text.",
                suggestion=(
                    "Use a standard bullet (•) from the document's list formatting rather than "
                    "Wingdings/Symbol glyphs, which extract as unmappable characters."
                ),
            )
        )

    # ── Shouting ──
    letters = [ch for ch in doc.text if ch.isalpha()]
    if letters:
        upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
        if upper_ratio > 0.35:
            score -= 2
            findings.append(
                ATSFinding(
                    category="formatting",
                    severity="INFO",
                    message=f"{upper_ratio:.0%} of the letters are uppercase.",
                    suggestion="Reserve all-caps for section headings. Body text in caps is harder to read and adds nothing for the parser.",
                )
            )

    # ── File type ──
    if filename:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext in {"pdf", "docx"}:
            pass
        elif ext in {"doc", "rtf", "odt", "pages"}:
            score -= 2
            findings.append(
                ATSFinding(
                    category="formatting",
                    severity="WARNING",
                    message=f'"{ext}" is an unreliable format for applicant tracking systems.',
                    suggestion="Submit a PDF exported from your word processor, or a .docx.",
                )
            )
        elif ext in {"txt", "md"}:
            findings.append(
                ATSFinding(
                    category="formatting",
                    severity="INFO",
                    message="Plain text parses perfectly but carries no formatting for a human reader.",
                    suggestion="Keep the plain-text version for pasting into forms, and submit a PDF where a file upload is offered.",
                )
            )

    # ── Repeated header/footer content ──
    # The same short line appearing on every page is page furniture. Many
    # parsers drop headers and footers entirely, so contact details there
    # disappear.
    short_lines = [ln for ln in doc.non_empty_lines if len(ln) <= 60]
    repeats = [line for line, count in Counter(short_lines).items() if count >= 3]
    if repeats:
        score -= 2
        findings.append(
            ATSFinding(
                category="formatting",
                severity="INFO",
                message="Some short lines repeat throughout the document, which looks like page header/footer content.",
                suggestion=(
                    "Keep contact details in the document body, not in the page header or footer — "
                    "many parsers discard those regions."
                ),
            )
        )

    if score == WEIGHT_FORMATTING:
        findings.append(
            ATSFinding(
                category="formatting",
                severity="GOOD",
                message="Clean single-column formatting with no parser-hostile elements.",
            )
        )

    summary = _summary_for(
        score, WEIGHT_FORMATTING, "ATS-safe formatting", "Mostly safe formatting", "Formatting will confuse parsers"
    )
    return _clamp(score, WEIGHT_FORMATTING), findings, summary


def _keyword_present(keyword: str, haystack: str) -> bool:
    """
    Word-boundary match, tolerant of the punctuation real skill names carry.

    "C++", "Node.js" and ".NET" all break a naive \\b...\\b pattern, so the
    keyword is escaped and the boundaries are only applied where the edge
    character is actually a word character.
    """
    cleaned = keyword.strip().lower()
    if not cleaned:
        return False
    pattern = re.escape(cleaned)
    prefix = r"(?<![a-z0-9])" if cleaned[0].isalnum() else ""
    suffix = r"(?![a-z0-9])" if cleaned[-1].isalnum() else ""
    return bool(re.search(prefix + pattern + suffix, haystack))


def _check_keywords(
    doc: _Doc,
    must_have: list[str],
    nice_to_have: list[str],
    source: Literal["JD", "MANUAL", "NONE"],
    jd_title: str | None,
) -> tuple[float, float, list[ATSFinding], str, ATSKeywordMatch]:
    """Returns (score, max_score, findings, summary, match). max_score is 0 when no JD."""
    if source == "NONE" or (not must_have and not nice_to_have):
        return (
            0.0,
            0.0,
            [
                ATSFinding(
                    category="keywords",
                    severity="INFO",
                    message="No job description was selected, so keyword matching was skipped.",
                    suggestion=(
                        "Pick a job description to see which of its required skills appear in "
                        "this resume. Keyword coverage is what most ATS filters actually rank on."
                    ),
                )
            ],
            "Not checked",
            ATSKeywordMatch(source="NONE"),
        )

    findings: list[ATSFinding] = []
    haystack = doc.lower

    must_matched = [kw for kw in must_have if _keyword_present(kw, haystack)]
    must_missing = [kw for kw in must_have if kw not in must_matched]
    nice_matched = [kw for kw in nice_to_have if _keyword_present(kw, haystack)]
    nice_missing = [kw for kw in nice_to_have if kw not in nice_matched]

    # Must-haves carry 70% of the category. A resume that covers every
    # nice-to-have but no hard requirement should not look like a match.
    must_ratio = len(must_matched) / len(must_have) if must_have else 1.0
    nice_ratio = len(nice_matched) / len(nice_to_have) if nice_to_have else 1.0
    if must_have and nice_to_have:
        score = WEIGHT_KEYWORDS * (must_ratio * 0.7 + nice_ratio * 0.3)
    else:
        score = WEIGHT_KEYWORDS * (must_ratio if must_have else nice_ratio)

    total = len(must_have) + len(nice_to_have)
    matched_total = len(must_matched) + len(nice_matched)
    coverage = (matched_total / total * 100) if total else 0.0

    if must_missing:
        preview = ", ".join(must_missing[:8])
        more = f" (+{len(must_missing) - 8} more)" if len(must_missing) > 8 else ""
        findings.append(
            ATSFinding(
                category="keywords",
                severity="CRITICAL" if must_ratio < 0.5 else "WARNING",
                message=f"{len(must_missing)} of {len(must_have)} must-have skills are absent: {preview}{more}.",
                suggestion=(
                    "Where the candidate genuinely has these, make sure the resume spells them "
                    "out using the same wording as the job description — ATS keyword matching "
                    "is literal, not semantic."
                ),
            )
        )
    elif must_have:
        findings.append(
            ATSFinding(
                category="keywords",
                severity="GOOD",
                message=f"All {len(must_have)} must-have skills appear in the resume.",
            )
        )

    if nice_missing and len(nice_missing) == len(nice_to_have) and nice_to_have:
        findings.append(
            ATSFinding(
                category="keywords",
                severity="INFO",
                message="None of the nice-to-have skills or tools were mentioned.",
                suggestion="Adding relevant secondary tools helps on roles that rank rather than filter.",
            )
        )

    match = ATSKeywordMatch(
        source=source,
        jd_title=jd_title,
        matched=must_matched + nice_matched,
        missing=must_missing + nice_missing,
        must_have_matched=must_matched,
        must_have_missing=must_missing,
        coverage_percent=round(coverage, 1),
    )
    summary = f"{coverage:.0f}% keyword coverage"
    return _clamp(score, WEIGHT_KEYWORDS), WEIGHT_KEYWORDS, findings, summary, match


# ─── Band + ordering ─────────────────────────────────────────

_BAND_HEADLINES: dict[str, str] = {
    "EXCELLENT": "This resume parses cleanly and covers what an ATS looks for.",
    "GOOD": "Solid overall — a few fixes would make this materially stronger.",
    "NEEDS_WORK": "An ATS would read this, but important pieces are missing or hard to parse.",
    "POOR": "This resume is likely to be dropped or badly mangled by an ATS.",
}

_SEVERITY_ORDER = {"CRITICAL": 0, "WARNING": 1, "INFO": 2, "GOOD": 3}


def _band_for(score: int) -> str:
    if score >= 85:
        return "EXCELLENT"
    if score >= 70:
        return "GOOD"
    if score >= 50:
        return "NEEDS_WORK"
    return "POOR"


def check_resume(
    text: str,
    *,
    filename: str | None = None,
    extraction_method: Literal["native", "ocr"] | None = None,
    must_have: list[str] | None = None,
    nice_to_have: list[str] | None = None,
    keyword_source: Literal["JD", "MANUAL", "NONE"] = "NONE",
    jd_title: str | None = None,
) -> ATSCheckResponse:
    """
    Score a resume for ATS readability and completeness.

    Pure function — no I/O, no randomness. The caller resolves any JD and
    passes its skills in as `must_have` / `nice_to_have`.
    """
    doc = _build_doc(text)

    parse_score, parse_findings, parse_summary = _check_parseability(doc, extraction_method)
    contact_score, contact_findings, contact_summary, contact = _check_contact(doc)
    section_score, section_findings, section_summary, detected, missing = _check_sections(doc)
    content_score, content_findings, content_summary = _check_content(doc)
    format_score, format_findings, format_summary = _check_formatting(doc, filename)
    kw_score, kw_max, kw_findings, kw_summary, kw_match = _check_keywords(
        doc,
        must_have or [],
        nice_to_have or [],
        keyword_source,
        jd_title,
    )

    categories = [
        ATSCategoryResult(
            key="parseability",
            label="Parseability",
            score=parse_score,
            max_score=WEIGHT_PARSEABILITY,
            summary=parse_summary,
        ),
        ATSCategoryResult(
            key="contact",
            label="Contact details",
            score=contact_score,
            max_score=WEIGHT_CONTACT,
            summary=contact_summary,
        ),
        ATSCategoryResult(
            key="sections",
            label="Section structure",
            score=section_score,
            max_score=WEIGHT_SECTIONS,
            summary=section_summary,
        ),
        ATSCategoryResult(
            key="content",
            label="Content quality",
            score=content_score,
            max_score=WEIGHT_CONTENT,
            summary=content_summary,
        ),
        ATSCategoryResult(
            key="formatting",
            label="Formatting",
            score=format_score,
            max_score=WEIGHT_FORMATTING,
            summary=format_summary,
        ),
        ATSCategoryResult(
            key="keywords",
            label="Keyword match",
            score=kw_score,
            max_score=kw_max,
            summary=kw_summary,
        ),
    ]

    # Normalise over the categories that actually applied, so skipping the
    # JD comparison doesn't cap the achievable score at 90.
    earned = sum(c.score for c in categories)
    available = sum(c.max_score for c in categories)
    overall = int(round(earned / available * 100)) if available else 0
    band = _band_for(overall)

    findings = [
        *parse_findings,
        *contact_findings,
        *section_findings,
        *content_findings,
        *format_findings,
        *kw_findings,
    ]
    # Most severe first — the report is read top-down and the critical items
    # are the ones that decide whether the resume survives the filter at all.
    findings.sort(key=lambda f: _SEVERITY_ORDER.get(f.severity, 9))

    word_count = len(doc.words)
    return ATSCheckResponse(
        score=overall,
        band=band,  # type: ignore[arg-type]
        headline=_BAND_HEADLINES[band],
        categories=categories,
        findings=findings,
        keyword_match=kw_match,
        detected_sections=detected,
        missing_sections=missing,
        detected_contact=contact,
        word_count=word_count,
        estimated_pages=round(max(word_count / WORDS_PER_PAGE, 0.1), 1),
    )
