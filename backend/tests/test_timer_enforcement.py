"""Unit tests for server-side exam timer enforcement.

Covers _is_past_deadline — the authoritative deadline check that rejects answer
writes after time expires (see attempt_service.save_answer / bulk save) and
drives the expired-attempt reaper (worker.task_reap_expired_attempts). Pure
function over (started_at, duration_minutes); no DB needed.
"""

from datetime import UTC, datetime, timedelta

from app.db.models.attempt import TestAttempt
from app.db.models.test import Test
from app.services.attempt_service import _WRITE_GRACE_SECONDS, _is_past_deadline


def _attempt(started_at):
    return TestAttempt(started_at=started_at)


def _test(minutes):
    return Test(duration_minutes=minutes)


def test_not_started_is_never_past_deadline():
    # No started_at yet (attempt created but timer not running) → not expired.
    assert _is_past_deadline(_attempt(None), _test(60)) is False


def test_well_within_time_is_not_past_deadline():
    started = datetime.now(tz=UTC) - timedelta(minutes=10)
    assert _is_past_deadline(_attempt(started), _test(60)) is False


def test_just_past_deadline_but_within_grace_is_allowed():
    # A few seconds past the deadline is inside the write-grace window, so an
    # autosave already in flight when the timer hit zero still lands.
    started = datetime.now(tz=UTC) - timedelta(minutes=60, seconds=_WRITE_GRACE_SECONDS - 5)
    assert _is_past_deadline(_attempt(started), _test(60)) is False


def test_beyond_grace_is_past_deadline():
    started = datetime.now(tz=UTC) - timedelta(minutes=60, seconds=_WRITE_GRACE_SECONDS + 30)
    assert _is_past_deadline(_attempt(started), _test(60)) is True


def test_well_past_deadline_is_past():
    started = datetime.now(tz=UTC) - timedelta(minutes=120)
    assert _is_past_deadline(_attempt(started), _test(60)) is True


def test_naive_started_at_is_treated_as_utc():
    # started_at persisted without tzinfo must not raise and must still expire.
    started = (datetime.now(tz=UTC) - timedelta(minutes=120)).replace(tzinfo=None)
    assert _is_past_deadline(_attempt(started), _test(60)) is True
