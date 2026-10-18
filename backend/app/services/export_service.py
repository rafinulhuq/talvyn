"""
Export service — generates DOCX evaluation reports.
"""

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

from app.schemas.evaluation import EvaluationResponse

_HIRE_THRESHOLDS = {
    "STRONG_HIRE": "≥ 80%",
    "HIRE":        "65 – 79%",
    "MAYBE":       "45 – 64%",
    "NO_HIRE":     "< 45%",
}

_REC_LABELS = {
    "STRONG_HIRE": "Strong Hire",
    "HIRE":        "Hire",
    "MAYBE":       "Maybe",
    "NO_HIRE":     "No Hire",
}

_REC_COLORS = {
    "STRONG_HIRE": "059669",
    "HIRE":        "22c55e",
    "MAYBE":       "f59e0b",
    "NO_HIRE":     "ef4444",
}

_LEVEL_LABELS = {
    "EXPERT":       "Expert (≥ 85%)",
    "ADVANCED":     "Advanced (70 – 84%)",
    "INTERMEDIATE": "Intermediate (50 – 69%)",
    "BEGINNER":     "Beginner (< 50%)",
}


def _set_cell_bg(cell, hex_color: str):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def _add_heading(doc: Document, text: str, level: int = 1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12 if level == 1 else 8)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(14 if level == 1 else 11)
    if level == 1:
        run.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)
    else:
        run.font.color.rgb = RGBColor(0x1E, 0x1E, 0x2E)
    return p


def _add_kv(doc: Document, key: str, value: str, value_color: str | None = None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(f"{key}: ")
    r.bold = True
    r.font.size = Pt(10)
    r2 = p.add_run(value)
    r2.font.size = Pt(10)
    if value_color:
        rgb = tuple(int(value_color[i:i+2], 16) for i in (0, 2, 4))
        r2.font.color.rgb = RGBColor(*rgb)
    return p


def _add_divider(doc: Document):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run("─" * 60)
    run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)
    run.font.size = Pt(8)


async def build_docx(ev: EvaluationResponse) -> bytes:
    doc = Document()

    # Set margins
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # ── Title ─────────────────────────────────────────────────
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = title.add_run("Candidate Evaluation Report")
    tr.bold = True
    tr.font.size = Pt(20)
    tr.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = subtitle.add_run("Talvyn AI Assessment Platform")
    sr.font.size = Pt(9)
    sr.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    doc.add_paragraph()

    # ── Summary table ─────────────────────────────────────────
    _add_heading(doc, "Assessment Summary", level=1)

    rec_key = ev.admin_override_recommendation or ev.ai_recommendation
    rec_label = _REC_LABELS.get(rec_key, rec_key)
    rec_color = _REC_COLORS.get(rec_key)
    source = "Admin Decision" if ev.admin_override_recommendation else "AI Recommendation"

    # Two-column score grid
    tbl = doc.add_table(rows=2, cols=3)
    tbl.style = "Table Grid"
    cells = [
        ("Overall Score", f"{ev.total_score} / {ev.max_score}  ({ev.percentage}%)", None),
        ("MCQ Score", f"{ev.mcq_score} / {ev.mcq_max}", None),
        ("Open-ended Score", f"{ev.open_ended_score} / {ev.open_ended_max}", None),
        (source, rec_label, rec_color),
        ("Evaluation Level", _LEVEL_LABELS.get(ev.evaluation_level or "", ev.evaluation_level or "N/A"), None),
        ("Evaluated At", str(ev.evaluated_at)[:19], None),
    ]
    for idx, (k, v, color) in enumerate(cells):
        row_idx = idx // 3
        col_idx = idx % 3
        cell = tbl.rows[row_idx].cells[col_idx]
        p = cell.paragraphs[0]
        p.add_run(f"{k}\n").bold = True
        r = p.add_run(v)
        r.font.size = Pt(10)
        if color:
            rgb = tuple(int(color[i:i+2], 16) for i in (0, 2, 4))
            r.font.color.rgb = RGBColor(*rgb)
        _set_cell_bg(cell, "F8FAFC")

    if ev.suitable_role:
        _add_kv(doc, "\nSuitable For", ev.suitable_role)

    if ev.is_preliminary:
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(6)
        r = p.add_run("⚠ Preliminary AI Assessment — final hiring decision must be made by a qualified human reviewer.")
        r.italic = True
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(0x92, 0x40, 0x0E)

    # ── Hiring threshold legend ───────────────────────────────
    doc.add_paragraph()
    _add_heading(doc, "Hiring Recommendation Criteria", level=2)
    tbl2 = doc.add_table(rows=1, cols=2)
    tbl2.style = "Table Grid"
    hdr = tbl2.rows[0].cells
    hdr[0].text = "Recommendation"
    hdr[1].text = "Score Range"
    for c in hdr:
        c.paragraphs[0].runs[0].bold = True
        _set_cell_bg(c, "DBEAFE")

    for key, threshold in _HIRE_THRESHOLDS.items():
        row = tbl2.add_row().cells
        row[0].text = _REC_LABELS[key]
        row[1].text = threshold
        if key == rec_key:
            _set_cell_bg(row[0], "E0F2FE")
            _set_cell_bg(row[1], "E0F2FE")

    # ── AI Summary ────────────────────────────────────────────
    if ev.ai_summary:
        doc.add_paragraph()
        _add_heading(doc, "AI Summary", level=2)
        p = doc.add_paragraph(ev.ai_summary)
        p.runs[0].font.size = Pt(10)

    # ── Strengths + Weaknesses ────────────────────────────────
    if ev.ai_strengths or ev.ai_weaknesses:
        doc.add_paragraph()
        _add_heading(doc, "Strengths & Weaknesses", level=2)

    if ev.ai_strengths:
        for s in ev.ai_strengths:
            p = doc.add_paragraph(f"  ✔  {s}")
            p.runs[0].font.size = Pt(10)
            p.runs[0].font.color.rgb = RGBColor(0x05, 0x96, 0x69)
            p.paragraph_format.space_after = Pt(2)

    if ev.ai_weaknesses:
        for w in ev.ai_weaknesses:
            p = doc.add_paragraph(f"  ✘  {w}")
            p.runs[0].font.size = Pt(10)
            p.runs[0].font.color.rgb = RGBColor(0xEF, 0x44, 0x44)
            p.paragraph_format.space_after = Pt(2)

    # ── Improvement suggestions ───────────────────────────────
    if ev.improvement_suggestions:
        doc.add_paragraph()
        _add_heading(doc, "Improvement Suggestions", level=2)
        for i, s in enumerate(ev.improvement_suggestions, 1):
            p = doc.add_paragraph(f"  {i}. {s}")
            p.runs[0].font.size = Pt(10)
            p.paragraph_format.space_after = Pt(2)

    # ── Skill performance breakdown ───────────────────────────
    if ev.skill_breakdown:
        doc.add_paragraph()
        _add_heading(doc, "Skill Performance Breakdown", level=2)
        tbl3 = doc.add_table(rows=1, cols=2)
        tbl3.style = "Table Grid"
        hdr3 = tbl3.rows[0].cells
        hdr3[0].text = "Skill"
        hdr3[1].text = "Score"
        for c in hdr3:
            c.paragraphs[0].runs[0].bold = True
            _set_cell_bg(c, "DBEAFE")
        sorted_skills = sorted(ev.skill_breakdown.items(), key=lambda x: x[1], reverse=True)
        for skill, pct in sorted_skills:
            row = tbl3.add_row().cells
            row[0].text = skill
            row[1].text = f"{pct}%"
            if pct >= 80:
                _set_cell_bg(row[1], "D1FAE5")
            elif pct >= 50:
                _set_cell_bg(row[1], "FEF3C7")
            else:
                _set_cell_bg(row[1], "FEE2E2")

    # ── Admin notes ───────────────────────────────────────────
    if ev.admin_notes:
        doc.add_paragraph()
        _add_heading(doc, "Admin Notes", level=2)
        p = doc.add_paragraph(ev.admin_notes)
        p.runs[0].font.size = Pt(10)

    # ── Per-question breakdown ────────────────────────────────
    if ev.question_feedback:
        doc.add_paragraph()
        _add_divider(doc)
        _add_heading(doc, "Question-by-Question Breakdown", level=1)

        for i, fb in enumerate(ev.question_feedback):
            q_type_label = (
                "MCQ" if fb.question_type == "MCQ"
                else "Code" if fb.question_type == "CODE"
                else "Open-ended"
            )
            effective_score = (
                fb.admin_awarded_score
                if fb.admin_awarded_score is not None
                else fb.awarded_score
            )
            pct = round(effective_score / fb.max_score * 100) if fb.max_score > 0 else 0

            p_hdr = _add_heading(
                doc,
                f"Q{i + 1}  [{q_type_label}]   {effective_score}/{fb.max_score}  ({pct}%)",
                level=2,
            )
            if pct >= 80:
                p_hdr.runs[0].font.color.rgb = RGBColor(0x05, 0x96, 0x69)
            elif pct >= 50:
                p_hdr.runs[0].font.color.rgb = RGBColor(0xD9, 0x77, 0x06)
            else:
                p_hdr.runs[0].font.color.rgb = RGBColor(0xDC, 0x26, 0x26)

            if fb.question_text:
                _add_kv(doc, "Question", fb.question_text)

            # MCQ options
            if fb.question_type == "MCQ" and fb.question_options:
                p = doc.add_paragraph()
                p.add_run("Options:").bold = True
                for opt in fb.question_options:
                    label = opt.get("label", "")
                    text = opt.get("text", "")
                    is_correct = opt.get("is_correct", False)
                    is_chosen = label == fb.candidate_answer
                    marker = " ✔ Correct" if is_correct else ""
                    chosen = " ← Candidate" if is_chosen else ""
                    op = doc.add_paragraph(f"    {label}. {text}{marker}{chosen}")
                    op.runs[0].font.size = Pt(10)
                    if is_correct:
                        op.runs[0].font.color.rgb = RGBColor(0x05, 0x96, 0x69)
                    elif is_chosen and not is_correct:
                        op.runs[0].font.color.rgb = RGBColor(0xDC, 0x26, 0x26)
                    op.paragraph_format.space_after = Pt(1)

            # OE / CODE answer
            elif fb.question_type in ("OPEN_ENDED", "CODE") and fb.candidate_answer:
                label = "Code Submission" if fb.question_type == "CODE" else "Candidate's Answer"
                _add_kv(doc, label, fb.candidate_answer or "(no answer provided)")

            if fb.ai_feedback:
                _add_kv(doc, "AI Feedback", fb.ai_feedback)

            if fb.admin_awarded_score is not None:
                _add_kv(
                    doc,
                    "Admin Score Override",
                    f"{fb.admin_awarded_score} / {fb.max_score}",
                    value_color="7C3AED",
                )

            if fb.matched_criteria:
                p = doc.add_paragraph()
                p.add_run("Matched Criteria:").bold = True
                for c in fb.matched_criteria:
                    cp = doc.add_paragraph(f"    ✔ {c}")
                    cp.runs[0].font.size = Pt(9)
                    cp.runs[0].font.color.rgb = RGBColor(0x05, 0x96, 0x69)
                    cp.paragraph_format.space_after = Pt(1)

            if fb.missed_criteria:
                p = doc.add_paragraph()
                p.add_run("Missed Criteria:").bold = True
                for c in fb.missed_criteria:
                    cp = doc.add_paragraph(f"    ✘ {c}")
                    cp.runs[0].font.size = Pt(9)
                    cp.runs[0].font.color.rgb = RGBColor(0xDC, 0x26, 0x26)
                    cp.paragraph_format.space_after = Pt(1)

            if i < len(ev.question_feedback) - 1:
                _add_divider(doc)

    # ── Footer line ───────────────────────────────────────────
    doc.add_paragraph()
    footer_p = doc.add_paragraph()
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = footer_p.add_run("Generated by Talvyn AI Assessment Platform")
    fr.font.size = Pt(8)
    fr.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def build_jd_report_docx(report: dict, leaderboard: dict) -> bytes:
    """
    Build a JD-level aggregate report DOCX.

    Combines the aggregate analytics from ``evaluation_service.get_system_report``
    (``report``) with the ranked candidate roster from
    ``evaluation_service.get_leaderboard`` (``leaderboard``) into a single
    downloadable document summarizing every candidate who took a given JD's test.
    """
    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)

    job_title = report.get("job_title") or "Unknown Role"
    total = report.get("total_evaluated", 0)

    # ── Title ─────────────────────────────────────────────────
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = title.add_run("Job Assessment Report")
    tr.bold = True
    tr.font.size = Pt(20)
    tr.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = subtitle.add_run(job_title)
    sr.bold = True
    sr.font.size = Pt(12)
    sr.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    subtitle2 = doc.add_paragraph()
    subtitle2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr2 = subtitle2.add_run("Talvyn AI Assessment Platform")
    sr2.font.size = Pt(9)
    sr2.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    doc.add_paragraph()

    if total == 0:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run("No candidates have completed an assessment for this job yet.")
        r.italic = True
        r.font.size = Pt(11)
        r.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()

    # ── Key metrics ───────────────────────────────────────────
    _add_heading(doc, "Overview", level=1)
    metrics = [
        ("Candidates Evaluated", str(total)),
        ("Average Score", f"{report.get('avg_percentage', 0)}%"),
        ("Highest Score", f"{report.get('highest_percentage', 0)}%"),
        ("Lowest Score", f"{report.get('lowest_percentage', 0)}%"),
    ]
    if report.get("pass_rate") is not None:
        metrics.append(("Pass Rate", f"{report['pass_rate']}%"))

    mtbl = doc.add_table(rows=1, cols=len(metrics))
    mtbl.style = "Table Grid"
    for idx, (k, v) in enumerate(metrics):
        cell = mtbl.rows[0].cells[idx]
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rv = p.add_run(v)
        rv.bold = True
        rv.font.size = Pt(13)
        p2 = cell.add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rk = p2.add_run(k)
        rk.font.size = Pt(8)
        rk.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
        _set_cell_bg(cell, "F8FAFC")

    # ── Recommendation distribution ───────────────────────────
    rec_counts = report.get("recommendation_counts") or {}
    if rec_counts:
        doc.add_paragraph()
        _add_heading(doc, "Recommendation Distribution", level=2)
        rtbl = doc.add_table(rows=1, cols=3)
        rtbl.style = "Table Grid"
        hdr = rtbl.rows[0].cells
        hdr[0].text, hdr[1].text, hdr[2].text = "Recommendation", "Candidates", "Share"
        for c in hdr:
            c.paragraphs[0].runs[0].bold = True
            _set_cell_bg(c, "DBEAFE")
        rec_total = sum(rec_counts.values()) or 1
        for key in ("STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"):
            count = rec_counts.get(key, 0)
            if not count:
                continue
            row = rtbl.add_row().cells
            r0 = row[0].paragraphs[0].add_run(_REC_LABELS.get(key, key))
            color = _REC_COLORS.get(key)
            if color:
                rgb = tuple(int(color[i:i+2], 16) for i in (0, 2, 4))
                r0.font.color.rgb = RGBColor(*rgb)
                r0.bold = True
            row[1].text = str(count)
            row[2].text = f"{round(count / rec_total * 100)}%"

    # ── Candidate level distribution ──────────────────────────
    level_counts = report.get("level_counts") or {}
    if level_counts:
        doc.add_paragraph()
        _add_heading(doc, "Candidate Level Distribution", level=2)
        ltbl = doc.add_table(rows=1, cols=3)
        ltbl.style = "Table Grid"
        hdr = ltbl.rows[0].cells
        hdr[0].text, hdr[1].text, hdr[2].text = "Level", "Candidates", "Share"
        for c in hdr:
            c.paragraphs[0].runs[0].bold = True
            _set_cell_bg(c, "DBEAFE")
        lvl_total = sum(level_counts.values()) or 1
        for key in ("EXPERT", "ADVANCED", "INTERMEDIATE", "BEGINNER"):
            count = level_counts.get(key, 0)
            if not count:
                continue
            row = ltbl.add_row().cells
            row[0].text = _LEVEL_LABELS.get(key, key)
            row[1].text = str(count)
            row[2].text = f"{round(count / lvl_total * 100)}%"

    # ── Common strengths / gaps ───────────────────────────────
    strong = report.get("common_strong_skills") or []
    weak = report.get("common_weak_skills") or []
    if strong:
        doc.add_paragraph()
        _add_heading(doc, "Common Strengths", level=2)
        p = doc.add_paragraph("  ".join(f"• {s}" for s in strong))
        p.runs[0].font.size = Pt(10)
        p.runs[0].font.color.rgb = RGBColor(0x05, 0x96, 0x69)
    if weak:
        doc.add_paragraph()
        _add_heading(doc, "Common Skill Gaps", level=2)
        p = doc.add_paragraph("  ".join(f"• {s}" for s in weak))
        p.runs[0].font.size = Pt(10)
        p.runs[0].font.color.rgb = RGBColor(0xD9, 0x77, 0x06)
        note = doc.add_paragraph()
        nr = note.add_run("These skills scored below 60% on average across all candidates.")
        nr.italic = True
        nr.font.size = Pt(8)
        nr.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    # ── Ranked candidate roster ───────────────────────────────
    entries = leaderboard.get("entries") or []
    if entries:
        doc.add_paragraph()
        _add_divider(doc)
        _add_heading(doc, "Candidate Ranking", level=1)

        has_passing = any(e.get("passing_marks") is not None for e in entries)
        cols = ["#", "Candidate", "Email", "Score", "Level", "Recommendation"]
        if has_passing:
            cols.append("Result")

        ctbl = doc.add_table(rows=1, cols=len(cols))
        ctbl.style = "Table Grid"
        for idx, label in enumerate(cols):
            c = ctbl.rows[0].cells[idx]
            c.text = label
            c.paragraphs[0].runs[0].bold = True
            c.paragraphs[0].runs[0].font.size = Pt(9)
            _set_cell_bg(c, "DBEAFE")

        for e in entries:
            row = ctbl.add_row().cells
            rec_key = e.get("admin_override_recommendation") or e.get("ai_recommendation")
            vals = [
                str(e.get("rank", "")),
                e.get("candidate_name") or "—",
                e.get("candidate_email") or "—",
                f"{e.get('total_score', 0)}/{e.get('max_score', 0)} ({e.get('percentage', 0)}%)",
                _LEVEL_LABELS.get(e.get("evaluation_level") or "", e.get("evaluation_level") or "—").split(" (")[0],
                _REC_LABELS.get(rec_key, rec_key or "—"),
            ]
            if has_passing:
                passed = e.get("passed")
                vals.append("Pass" if passed else "Fail" if passed is not None else "—")
            for idx, v in enumerate(vals):
                cell = row[idx]
                cell.text = v
                for r in cell.paragraphs[0].runs:
                    r.font.size = Pt(9)
            # Colour the recommendation cell
            color = _REC_COLORS.get(rec_key)
            if color and row[5].paragraphs[0].runs:
                rgb = tuple(int(color[i:i+2], 16) for i in (0, 2, 4))
                row[5].paragraphs[0].runs[0].font.color.rgb = RGBColor(*rgb)

    # ── Footer ────────────────────────────────────────────────
    doc.add_paragraph()
    footer_p = doc.add_paragraph()
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = footer_p.add_run("Generated by Talvyn AI Assessment Platform")
    fr.font.size = Pt(8)
    fr.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
