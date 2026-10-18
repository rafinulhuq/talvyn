"""
ATS Checker tests.

Two layers:
  1. Unit tests over ats_service.check_resume() — the deterministic scoring
     engine. These are the meaningful ones: every rule is a pure function of
     the text, so a good resume and a hostile one must land in predictably
     different bands.
  2. API tests over /api/v1/ats/* — auth, validation, JD scoping, and the
     keyword-matching path.
"""

import uuid

import pytest

from app.db.models.enums import FileType, ParseStatus, Role
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.user import User
from app.services import ats_service

# The id conftest's client fixture forwards as X-Actor-Id. It resolves to no
# User row by default, which owner_scope_for() treats as unscoped (ADMIN-like).
CONFTEST_ACTOR_ID = "00000000-0000-0000-0000-000000000000"


async def _seed_jd(db_session, *, owner_id: str, analyzed: bool = True) -> str:
    jd_id = str(uuid.uuid4())
    db_session.add(
        JobDescription(
            id=jd_id,
            uploaded_by=owner_id,
            original_filename="staff-backend.pdf",
            file_path="jds/staff-backend.pdf",
            file_type=FileType.PDF,
            raw_text="role",
            parse_status=ParseStatus.DONE,
        )
    )
    if analyzed:
        db_session.add(
            JdExtractedData(
                jd_id=jd_id,
                job_title="Staff Backend Engineer",
                seniority_level="senior",
                must_have_skills=["Python", "Kubernetes", "Rust"],
                nice_to_have_skills=["Terraform"],
                tools_technologies=["Kafka"],
                responsibilities=[],
                recommended_test_topics=[],
                difficulty_distribution={},
            )
        )
    await db_session.flush()
    return jd_id


async def _seed_user(db_session, role: Role) -> str:
    uid = str(uuid.uuid4())
    db_session.add(
        User(
            id=uid,
            email=f"{uid}@example.com",
            name="Actor",
            password_hash="x",
            role=role,
            is_active=True,
        )
    )
    await db_session.flush()
    return uid

# ─── Fixtures: two resumes at opposite ends of the scale ─────

GOOD_RESUME = """
Priya Raman
Bangalore, India
priya.raman@example.com | +91 98765 43210
linkedin.com/in/priyaraman | github.com/priyaraman

Professional Summary
Backend engineer with eight years building payment infrastructure at scale, spanning
settlement, fraud scoring, and merchant onboarding. Comfortable owning a service end
to end, from schema design through on-call, and used to working across teams to land
migrations without downtime.

Work Experience

Staff Engineer, PayLoop
Mar 2021 - Present
- Redesigned the settlement pipeline, cutting reconciliation time from 6 hours to 22 minutes.
- Migrated 140 services from Python 3.8 to 3.12 with zero customer-facing downtime.
- Reduced infrastructure spend by 38% through workload right-sizing.
- Mentored 5 engineers, three of whom were promoted within the year.

Senior Engineer, Fintrace
Jun 2017 - Feb 2021
- Built a fraud-scoring service handling 12,000 requests per second at p99 of 40ms.
- Automated the release pipeline, taking deploys from weekly to 30 per day.
- Led the migration to Kubernetes across 4 regions.

Senior Engineer, Fintrace
Jun 2017 - Feb 2021
- Designed the merchant onboarding API now used by 2,400 merchants.
- Cut the nightly batch window from 4 hours to 35 minutes by parallelising ledger writes.
- Introduced contract testing across 9 teams, reducing integration incidents by 60%.
- Established the on-call rotation and runbooks for 3 tier-1 services.

Engineer, Cloudmint
Aug 2015 - May 2017
- Shipped the customer billing dashboard used daily by 800 internal staff.
- Optimised the reporting queries, taking the slowest report from 90s to under 3s.
- Wrote the data migration that moved 40 million rows with no downtime.

Projects

Ledgerkit - an open-source double-entry accounting library in Go
- Published to 1,200 GitHub stars and used in production by 6 companies.
- Documented the API and maintained 94% test coverage across 3 releases.

Education

B.Tech, Computer Science, IIT Madras
2013 - 2017

Skills
Python, Go, PostgreSQL, Kafka, Kubernetes, Docker, Terraform, AWS, Redis

Certifications
AWS Certified Solutions Architect, 2022
"""

# Everything an ATS hates: no headings it recognises, no contact block, no
# dates it can parse, prose instead of bullets, table pipes.
BAD_RESUME = """
CURRICULUM VITAE OF A VERY EXCELLENT CANDIDATE

| Name | The Candidate |
| Field | Technology |
| Status | Available |

About this person: they are responsible for many things at their company and have
been working on software for a long time. Worked on various projects involving
computers and also databases. Helped with a number of initiatives that were
important to the business at the time they were undertaken by the team.

I am a hard worker and my colleagues say I am dedicated. I believe my skills
speak for themselves and I would be a great fit for your organisation. I have
always been passionate about technology and I enjoy learning new things every
single day of my professional working life in this industry.

They did some work with programming languages and frameworks and other kinds of
technology tools that are used in the building of software systems generally.
"""


def _score(text: str, **kwargs) -> int:
    return ats_service.check_resume(text, **kwargs).score


# ─── Scoring engine ──────────────────────────────────────────

def test_well_formed_resume_scores_well():
    result = ats_service.check_resume(GOOD_RESUME, filename="priya-raman.pdf")
    assert result.score >= 90, f"expected a strong score, got {result.score}"
    assert result.band == "EXCELLENT"
    assert not [
        f for f in result.findings if f.severity in ("CRITICAL", "WARNING")
    ], "a well-formed resume should raise nothing above INFO"


def test_hostile_resume_scores_poorly():
    result = ats_service.check_resume(BAD_RESUME, filename="cv.pdf")
    assert result.score < 55, f"expected a weak score, got {result.score}"
    assert result.band in ("NEEDS_WORK", "POOR")
    assert [f for f in result.findings if f.severity == "CRITICAL"]


def test_scoring_is_deterministic():
    """The whole point of the rule engine: identical input, identical report."""
    first = ats_service.check_resume(GOOD_RESUME, filename="r.pdf")
    second = ats_service.check_resume(GOOD_RESUME, filename="r.pdf")
    assert first.model_dump() == second.model_dump()


def test_findings_are_ordered_most_severe_first():
    result = ats_service.check_resume(BAD_RESUME)
    order = {"CRITICAL": 0, "WARNING": 1, "INFO": 2, "GOOD": 3}
    severities = [order[f.severity] for f in result.findings]
    assert severities == sorted(severities)


# ─── Contact detection ───────────────────────────────────────

def test_detects_contact_details():
    contact = ats_service.check_resume(GOOD_RESUME).detected_contact
    assert contact.email == "priya.raman@example.com"
    assert contact.phone is not None
    assert contact.location == "Bangalore, India"
    assert any("linkedin.com" in link for link in contact.links)


def test_missing_email_is_critical():
    without_email = GOOD_RESUME.replace("priya.raman@example.com | ", "")
    result = ats_service.check_resume(without_email)
    assert result.detected_contact.email is None
    assert any(
        f.category == "contact" and f.severity == "CRITICAL" for f in result.findings
    )


def test_year_range_is_not_mistaken_for_a_phone_number():
    """"2013 - 2017" must not satisfy the phone check on its own."""
    text = GOOD_RESUME.replace("+91 98765 43210", "").replace(" | \n", "\n")
    assert ats_service.check_resume(text).detected_contact.phone is None


# ─── Section detection ───────────────────────────────────────

def test_detects_standard_sections():
    result = ats_service.check_resume(GOOD_RESUME)
    assert "Experience" in result.detected_sections
    assert "Education" in result.detected_sections
    assert "Skills" in result.detected_sections
    assert "Summary" in result.detected_sections


def test_missing_required_section_is_reported():
    without_education = GOOD_RESUME.replace("Education\n", "Background Information\n")
    result = ats_service.check_resume(without_education)
    assert "Education" in result.missing_sections
    assert any(
        f.category == "sections" and "Education" in f.message for f in result.findings
    )


def test_section_named_only_inline_scores_partial_credit():
    """
    A resume that says "my education included..." but has no Education
    heading should score above one with no mention at all, and below one
    with a real heading — the point of the inline-only distinction.
    """
    heading = GOOD_RESUME
    inline = GOOD_RESUME.replace(
        "Education\n\nB.Tech", "My education is described below.\n\nB.Tech"
    )
    absent = GOOD_RESUME.replace(
        "Education\n\nB.Tech, Computer Science, IIT Madras", "B.Tech, Computer Science, IIT Madras"
    )
    assert _score(absent) < _score(inline) < _score(heading)


# ─── Parseability ────────────────────────────────────────────

def test_ocr_extraction_is_a_critical_finding():
    result = ats_service.check_resume(GOOD_RESUME, extraction_method="ocr")
    assert any(
        f.category == "parseability" and f.severity == "CRITICAL" for f in result.findings
    )
    assert result.score < _score(GOOD_RESUME, extraction_method="native")


def test_multi_column_fragmentation_is_detected():
    """One or two words per line is what a parsed sidebar layout looks like."""
    fragmented = "\n".join(
        ["Priya", "Raman", "Engineer", "Python", "Go", "AWS"] * 12
    )
    result = ats_service.check_resume(fragmented)
    assert any("fragmented" in f.message for f in result.findings)


def test_short_resume_is_flagged():
    tiny = "Jane Doe\njane@example.com\n" + "Built things at a company. " * 12
    result = ats_service.check_resume(tiny)
    assert result.word_count < 150
    assert any(
        f.category == "parseability" and f.severity == "CRITICAL" for f in result.findings
    )


# ─── Content quality ─────────────────────────────────────────

def _strip_all_numbers(text: str) -> str:
    """Blank every digit that isn't part of a year, leaving the prose intact."""
    import re

    years = re.findall(r"\b(?:19|20)\d{2}\b", text)
    placeholder = "\x00YEAR\x00"
    for year in set(years):
        text = text.replace(year, placeholder + year + placeholder)
    parts = text.split(placeholder)
    return "".join(
        part if index % 2 else re.sub(r"\d+(?:,\d{3})*(?:\.\d+)?%?", "several", part)
        for index, part in enumerate(parts)
    )


def test_quantified_bullets_beat_vague_ones():
    quantified = GOOD_RESUME
    vague = (
        _strip_all_numbers(GOOD_RESUME)
        .replace("cutting reconciliation time from several hours to several minutes", "making it faster")
        .replace("Migrated 140 services from Python 3.8 to 3.12", "Migrated services from Python")
        .replace("Reduced infrastructure spend by 38%", "Reduced infrastructure spend")
        .replace("Mentored 5 engineers, three of whom were promoted within the year", "Mentored engineers")
        .replace("handling 12,000 requests per second at p99 of 40ms", "handling many requests")
        .replace("taking deploys from weekly to 30 per day", "improving deploys")
        .replace("across 4 regions", "across regions")
    )
    assert _score(vague) < _score(quantified)


def test_weak_openers_are_flagged():
    result = ats_service.check_resume(
        GOOD_RESUME.replace("- Redesigned the settlement", "- Responsible for the settlement")
    )
    assert any("filler" in f.message for f in result.findings)


def test_unparseable_dates_are_critical():
    import re

    # Strip every year, which is what a resume that writes "recently" and
    # "for the last few years" instead of real ranges looks like.
    undated = re.sub(r"\b(?:19|20)\d{2}\b", "recently", GOOD_RESUME)
    result = ats_service.check_resume(undated)
    assert any(
        f.category == "content" and f.severity == "CRITICAL" for f in result.findings
    )


# ─── Formatting ──────────────────────────────────────────────

def test_table_layout_is_flagged():
    result = ats_service.check_resume(BAD_RESUME)
    formatting = [f for f in result.findings if f.category == "formatting"]
    assert any("table or column layout" in f.message for f in formatting)
    # And it must actually cost points, not merely produce a note.
    category = next(c for c in result.categories if c.key == "formatting")
    assert category.score < category.max_score


def test_legacy_file_format_is_flagged():
    result = ats_service.check_resume(GOOD_RESUME, filename="resume.doc")
    assert any(
        f.category == "formatting" and "doc" in f.message for f in result.findings
    )
    assert _score(GOOD_RESUME, filename="resume.doc") < _score(
        GOOD_RESUME, filename="resume.pdf"
    )


def test_symbol_font_bullets_are_flagged():
    with_pua = GOOD_RESUME.replace("- Redesigned", " Redesigned")
    result = ats_service.check_resume(with_pua)
    assert any("Symbol-font" in f.message for f in result.findings)


# ─── Keyword matching ────────────────────────────────────────

def test_keyword_category_is_skipped_without_a_jd():
    result = ats_service.check_resume(GOOD_RESUME)
    keywords = next(c for c in result.categories if c.key == "keywords")
    assert keywords.max_score == 0
    assert result.keyword_match.source == "NONE"
    # And the overall score must still be able to reach 100 — the skipped
    # category is normalised out, not scored as a zero.
    assert sum(c.max_score for c in result.categories) == 90


def test_keyword_matching_reports_matched_and_missing():
    result = ats_service.check_resume(
        GOOD_RESUME,
        must_have=["Python", "Kubernetes", "Rust", "Elixir"],
        nice_to_have=["Terraform"],
        keyword_source="JD",
        jd_title="Staff Backend Engineer",
    )
    assert result.keyword_match.jd_title == "Staff Backend Engineer"
    assert set(result.keyword_match.must_have_matched) == {"Python", "Kubernetes"}
    assert set(result.keyword_match.must_have_missing) == {"Rust", "Elixir"}
    assert "Terraform" in result.keyword_match.matched
    assert sum(c.max_score for c in result.categories) == 100


def test_punctuated_keywords_match():
    """C++, Node.js and .NET break a naive word-boundary match."""
    text = GOOD_RESUME.replace("Python, Go,", "C++, Node.js, .NET, Python, Go,")
    result = ats_service.check_resume(
        text,
        must_have=["C++", "Node.js", ".NET"],
        keyword_source="JD",
    )
    assert result.keyword_match.must_have_missing == []


def test_keyword_match_does_not_match_substrings():
    """"Go" must not match inside "Google"; "R" must not match every word."""
    text = "Ravi Kumar\nravi@example.com\n" + ("Worked at Google on great things. " * 30)
    result = ats_service.check_resume(text, must_have=["Go", "R"], keyword_source="JD")
    assert set(result.keyword_match.must_have_missing) == {"Go", "R"}


def test_missing_must_haves_lower_the_score():
    covered = _score(
        GOOD_RESUME, must_have=["Python", "Kafka"], keyword_source="JD"
    )
    uncovered = _score(
        GOOD_RESUME, must_have=["Rust", "Haskell"], keyword_source="JD"
    )
    assert uncovered < covered


# ─── API ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_endpoint_returns_a_report(client):
    res = await client.post(
        "/api/v1/ats/check",
        json={"text": GOOD_RESUME, "filename": "priya-raman.pdf"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert 0 <= body["score"] <= 100
    assert body["keyword_match"]["source"] == "NONE"
    assert "Experience" in body["detected_sections"]
    assert body["disclaimer"]


@pytest.mark.asyncio
async def test_check_endpoint_rejects_too_little_text(client):
    res = await client.post("/api/v1/ats/check", json={"text": "Too short."})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_check_endpoint_requires_internal_token(client):
    headers = dict(client.headers)
    headers.pop("x-internal-token", None)
    res = await client.post(
        "/api/v1/ats/check",
        json={"text": GOOD_RESUME},
        headers={**headers, "X-Internal-Token": "wrong"},
    )
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_check_endpoint_accepts_manual_keywords(client):
    res = await client.post(
        "/api/v1/ats/check",
        json={"text": GOOD_RESUME, "keywords": ["Python", "Rust"]},
    )
    assert res.status_code == 200, res.text
    match = res.json()["keyword_match"]
    assert match["source"] == "MANUAL"
    assert match["must_have_matched"] == ["Python"]
    assert match["must_have_missing"] == ["Rust"]


@pytest.mark.asyncio
async def test_check_endpoint_404s_for_an_unknown_jd(client):
    res = await client.post(
        "/api/v1/ats/check",
        json={"text": GOOD_RESUME, "jd_id": "00000000-0000-0000-0000-0000000000ff"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_check_endpoint_matches_against_a_jds_extracted_skills(client, db_session):
    owner_id = await _seed_user(db_session, Role.ADMIN)
    jd_id = await _seed_jd(db_session, owner_id=owner_id)

    res = await client.post(
        "/api/v1/ats/check",
        json={"text": GOOD_RESUME, "jd_id": jd_id},
    )
    assert res.status_code == 200, res.text
    match = res.json()["keyword_match"]
    assert match["source"] == "JD"
    assert match["jd_title"] == "Staff Backend Engineer"
    assert set(match["must_have_matched"]) == {"Python", "Kubernetes"}
    assert match["must_have_missing"] == ["Rust"]
    assert "Terraform" in match["matched"]
    assert "Kafka" in match["matched"]


@pytest.mark.asyncio
async def test_check_endpoint_rejects_an_unanalyzed_jd(client, db_session):
    owner_id = await _seed_user(db_session, Role.ADMIN)
    jd_id = await _seed_jd(db_session, owner_id=owner_id, analyzed=False)

    res = await client.post(
        "/api/v1/ats/check",
        json={"text": GOOD_RESUME, "jd_id": jd_id},
    )
    # ValidationError maps to 422 app-wide (see app/core/exceptions.py).
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "JD_NOT_ANALYZED"


@pytest.mark.asyncio
async def test_a_user_cannot_match_against_someone_elses_jd(client, db_session):
    """
    Owner scoping: a USER passing another operator's jd_id must get a 404,
    not a keyword report. Otherwise this endpoint would leak the existence
    and extracted skills of every JD in the workspace.
    """
    owner_id = await _seed_user(db_session, Role.ADMIN)
    other_user_id = await _seed_user(db_session, Role.USER)
    jd_id = await _seed_jd(db_session, owner_id=owner_id)

    res = await client.post(
        "/api/v1/ats/check",
        json={"text": GOOD_RESUME, "jd_id": jd_id},
        headers={"X-Actor-Id": other_user_id},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_extract_endpoint_returns_text_and_method(client, sample_pdf_bytes):
    res = await client.post(
        "/api/v1/ats/extract",
        files={"file": ("resume.pdf", sample_pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["extraction_method"] in ("native", "ocr")
    assert body["text"]


@pytest.mark.asyncio
async def test_extract_endpoint_rejects_a_disallowed_file_type(client):
    res = await client.post(
        "/api/v1/ats/extract",
        files={"file": ("resume.exe", b"MZ\x90\x00binary", "application/octet-stream")},
    )
    assert res.status_code in (400, 415, 422)
