"""
Tests for hard exam-integrity enforcement: terminating an attempt on a
candidate-side violation (tab switch, window blur) must end the WHOLE
invitation, not just the current test, and block every further interaction.
DB uses in-memory SQLite.
"""

from httpx import AsyncClient
from sqlalchemy import select

from app.db.models.attempt import SuspiciousEvent, TestAttempt
from app.db.models.candidate import Invitation
from app.db.models.enums import AttemptStatus, InvitationStatus
from tests.test_attempts import _seed_full_stack, _seed_multi_test_stack


async def _start_and_terminate(
    client: AsyncClient, raw_token: str, reason: str = "VISIBILITY_HIDDEN"
) -> tuple[str, dict]:
    start = await client.post(
        "/api/v1/attempts/start",
        json={"token": raw_token, "test_index": 0},
    )
    attempt_id = start.json()["attempt_id"]

    resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/terminate",
        headers={"X-Attempt-Token": raw_token},
        json={"reason": reason},
    )
    return attempt_id, resp.json()


class TestTerminateAttempt:
    async def test_terminate_sets_attempt_and_invitation_state(
        self, client: AsyncClient, db_session
    ):
        raw_token, invitation_id, _ = await _seed_full_stack(db_session)

        attempt_id, body = await _start_and_terminate(client, raw_token, "VISIBILITY_HIDDEN")
        assert body["status"] == "TERMINATED"

        attempt_result = await db_session.execute(
            select(TestAttempt).where(TestAttempt.id == attempt_id)
        )
        attempt = attempt_result.scalar_one()
        assert attempt.status == AttemptStatus.TERMINATED
        assert attempt.integrity_violation_reason == "VISIBILITY_HIDDEN"
        assert attempt.terminated_at is not None

        inv_result = await db_session.execute(
            select(Invitation).where(Invitation.id == invitation_id)
        )
        invitation = inv_result.scalar_one()
        assert invitation.status == InvitationStatus.TERMINATED
        assert invitation.integrity_violation_reason == "VISIBILITY_HIDDEN"
        assert invitation.terminated_at is not None

        events_result = await db_session.execute(
            select(SuspiciousEvent).where(SuspiciousEvent.attempt_id == attempt_id)
        )
        events = events_result.scalars().all()
        assert len(events) == 1
        assert events[0].event_type == "VISIBILITY_HIDDEN"
        assert events[0].event_metadata["led_to_termination"] is True

    async def test_terminate_is_idempotent(self, client: AsyncClient, db_session):
        raw_token, _, _ = await _seed_full_stack(db_session)
        attempt_id, first = await _start_and_terminate(client, raw_token)

        second_resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/terminate",
            headers={"X-Attempt-Token": raw_token},
            json={"reason": "WINDOW_BLUR"},
        )
        assert second_resp.status_code == 200
        second = second_resp.json()
        assert second["status"] == "TERMINATED"
        # SQLite round-trips datetimes without tz info, so compare parsed
        # values rather than raw strings (Postgres wouldn't have this quirk).
        from datetime import datetime
        assert datetime.fromisoformat(
            second["terminated_at"].rstrip("Z")
        ) == datetime.fromisoformat(first["terminated_at"].rstrip("Z"))

        # Only the original event was logged — re-terminating doesn't double-write.
        events_result = await db_session.execute(
            select(SuspiciousEvent).where(SuspiciousEvent.attempt_id == attempt_id)
        )
        assert len(events_result.scalars().all()) == 1

    async def test_terminated_token_cannot_resume_same_attempt(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)
        await _start_and_terminate(client, raw_token)

        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        assert resp.status_code == 403
        assert "integrity violation" in resp.json()["detail"].lower()

    async def test_terminating_one_test_blocks_remaining_tests_in_invitation(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, test_ids = await _seed_multi_test_stack(db_session)
        assert len(test_ids) == 2

        await _start_and_terminate(client, raw_token)

        # The second, never-started test in this same invitation must also
        # be blocked — this is the "cheating in one test blocks all
        # remaining tests" requirement.
        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 1},
        )
        assert resp.status_code == 403
        assert "integrity violation" in resp.json()["detail"].lower()

    async def test_get_attempt_state_returns_200_with_terminal_info(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)
        attempt_id, _ = await _start_and_terminate(client, raw_token, "TAB_SWITCH")

        resp = await client.get(
            f"/api/v1/attempts/{attempt_id}/state",
            headers={"X-Attempt-Token": raw_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "TERMINATED"
        assert data["integrity_violation_reason"] == "TAB_SWITCH"
        assert data["terminated_at"] is not None

    async def test_submit_after_termination_is_rejected(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)
        attempt_id, _ = await _start_and_terminate(client, raw_token)

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": False},
        )
        assert resp.status_code == 403

    async def test_validate_token_reports_terminated_reason(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)
        await _start_and_terminate(client, raw_token)

        resp = await client.get(f"/api/v1/invitations/validate/{raw_token}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["reason"] == "terminated"

    async def test_get_evaluation_on_terminated_attempt_returns_distinct_error(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)
        attempt_id, _ = await _start_and_terminate(client, raw_token)

        resp = await client.get(f"/api/v1/evaluation/{attempt_id}")
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "ATTEMPT_TERMINATED"
