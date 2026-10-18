"""
Tests for the USER role and require_min_role gating.

- A USER (the default self-signup role) is forbidden from ADMIN-only config
  routes (webhooks).
- An ADMIN is allowed.
- A USER can still reach the operator workflow routes (which are gated only by
  the internal token, not by role).

DB uses in-memory SQLite (see conftest.py); each actor is seeded with a unique
id and passed via X-Actor-Id, overriding the client fixture's default header.
"""

import uuid

from app.db.models.enums import Role
from app.db.models.job_description import JobDescription
from app.db.models.user import User


async def _seed_user(db_session, role: Role) -> dict[str, str]:
    actor_id = str(uuid.uuid4())
    db_session.add(
        User(
            id=actor_id,
            email=f"{role.value.lower()}-{actor_id}@example.com",
            name=f"{role.value} actor",
            password_hash="not-used",
            role=role,
            is_active=True,
        )
    )
    await db_session.commit()
    return {"X-Actor-Id": actor_id}


class TestRoleGating:
    async def test_user_is_forbidden_from_webhooks(self, client, db_session):
        headers = await _seed_user(db_session, Role.USER)
        resp = await client.get("/api/v1/admin/webhooks/", headers=headers)
        assert resp.status_code == 403

    async def test_admin_is_allowed_on_webhooks(self, client, db_session):
        headers = await _seed_user(db_session, Role.ADMIN)
        resp = await client.get("/api/v1/admin/webhooks/", headers=headers)
        assert resp.status_code == 200

    async def test_superadmin_is_allowed_on_webhooks(self, client, db_session):
        headers = await _seed_user(db_session, Role.SUPER_ADMIN)
        resp = await client.get("/api/v1/admin/webhooks/", headers=headers)
        assert resp.status_code == 200

    async def test_user_can_reach_operator_workflow(self, client, db_session):
        # JD listing is an operator route (internal-token only, no role gate) —
        # a USER must still be able to use it.
        headers = await _seed_user(db_session, Role.USER)
        resp = await client.get("/api/v1/jd/", headers=headers)
        assert resp.status_code == 200

    async def test_dev_is_scoped_like_user_not_org_wide(self, client, db_session):
        # DEV is docs-only (see backend/app/dependencies.py owner_scope_for)
        # and must never fall into ADMIN/SUPER_ADMIN's unscoped bucket.
        # Regression test for a real bug: owner_scope_for() used to check
        # `actor.role == Role.USER` directly, and since DEV != USER, a DEV
        # actor got org-wide access identical to ADMIN — the fix scopes
        # anything ranked below ADMIN via ROLE_RANK instead.
        admin_headers = await _seed_user(db_session, Role.ADMIN)
        admin_actor_id = admin_headers["X-Actor-Id"]
        db_session.add(
            JobDescription(
                uploaded_by=admin_actor_id,
                original_filename="admin-owned-jd.pdf",
            )
        )
        await db_session.commit()

        dev_headers = await _seed_user(db_session, Role.DEV)
        resp = await client.get("/api/v1/jd/", headers=dev_headers)
        assert resp.status_code == 200
        jd_ids = [jd["id"] for jd in resp.json()["items"]]
        assert not jd_ids, (
            "DEV actor saw another user's JD — owner_scope_for() is not "
            "scoping DEV the way it scopes USER"
        )

    async def test_inactive_actor_is_unauthorized(self, client, db_session):
        actor_id = str(uuid.uuid4())
        db_session.add(
            User(
                id=actor_id,
                email=f"inactive-{actor_id}@example.com",
                name="Inactive",
                password_hash="not-used",
                role=Role.ADMIN,
                is_active=False,
            )
        )
        await db_session.commit()
        resp = await client.get(
            "/api/v1/admin/webhooks/", headers={"X-Actor-Id": actor_id}
        )
        assert resp.status_code == 401
