"""Integration tests for CMP author profiles (superadmin-managed blog bylines)."""

from httpx import AsyncClient

from app.db.models.cms import CmsAuthorProfile  # noqa: F401
from app.db.models.enums import Role
from app.db.models.user import User

ACTOR_ID = "00000000-0000-0000-0000-000000000000"


async def _remove_actor(db_session) -> None:
    """Other test modules seed the same shared actor id — remove it so the
    401 (unknown actor) assertion holds regardless of test order."""
    existing = await db_session.get(User, ACTOR_ID)
    if existing is not None:
        await db_session.delete(existing)
        await db_session.commit()


async def _seed_actor(db_session, *, role: Role = Role.SUPER_ADMIN) -> None:
    existing = await db_session.get(User, ACTOR_ID)
    if existing is None:
        db_session.add(
            User(
                id=ACTOR_ID,
                email="authors-admin@example.com",
                name="Authors Admin",
                password_hash="not-used",
                role=role,
                is_active=True,
            )
        )
    else:
        existing.role = role
        existing.is_active = True
        existing.name = "Authors Admin"
    await db_session.commit()


class TestCmsAuthorProfiles:
    async def test_routes_require_superadmin(self, client: AsyncClient, db_session):
        await _remove_actor(db_session)
        missing_actor = await client.get("/api/v1/cmp/authors")
        assert missing_actor.status_code == 401

        await _seed_actor(db_session, role=Role.ADMIN)
        normal_admin = await client.get("/api/v1/cmp/authors")
        assert normal_admin.status_code == 403

    async def test_create_list_update_and_archive_profile(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        created = await client.post("/api/v1/cmp/authors", json={"name": "Jane Doe"})
        assert created.status_code == 201
        profile = created.json()
        assert profile["name"] == "Jane Doe"
        assert profile["avatar_url"] is None

        listed = await client.get("/api/v1/cmp/authors")
        assert listed.status_code == 200
        assert [item["id"] for item in listed.json()["items"]] == [profile["id"]]

        updated = await client.patch(
            f"/api/v1/cmp/authors/{profile['id']}", json={"name": "Jane D. Doe"}
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Jane D. Doe"

        archived = await client.delete(f"/api/v1/cmp/authors/{profile['id']}")
        assert archived.status_code == 204

        listed_after_archive = await client.get("/api/v1/cmp/authors")
        assert listed_after_archive.json()["items"] == []
