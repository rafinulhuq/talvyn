"""
Pass-mark policy — the single place the pass threshold is defined.

Background: `tests.passing_marks` is nullable and, until this module existed,
nothing in the product ever wrote it. Every test created by AI generation or
the question-bank flow was left NULL, which makes evaluation_service compute
`passed = None` forever — so the leaderboard's Pass/Fail column, its outcome
filter, and the CSV export all had no verdict to show. Setting the mark at
creation time is what makes that column mean anything.

Lives in core/ rather than a service so test_generation_service and
question_bank_service can both import it without a circular import.
"""

import math

from app.config import get_settings


def default_passing_marks(total_marks: int) -> int | None:
    """
    The pass mark a newly created test starts with, from DEFAULT_PASSING_PERCENTAGE.

    Returns None when the test has no marks yet. Question-bank sections are
    created with total_marks=0 and summed only once their questions land, and
    writing 0 there would mean "everyone passes" — strictly worse than leaving
    no verdict, because it reports a false Pass rather than an honest blank.

    Rounds up, so the bar is genuinely *at least* the configured percentage: on
    a 33-mark test, 80% is 26.4 — rounding down to 26 would pass someone at
    78.8%, under the stated threshold. Ceiling gives 27 (81.8%).
    """
    if total_marks <= 0:
        return None
    percentage = get_settings().default_passing_percentage
    return math.ceil(total_marks * percentage / 100)
