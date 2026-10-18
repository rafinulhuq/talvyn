"""
Integration tests for the admin Trash (soft-delete / recycle-bin) flow.

Covers the round trip for each supported entity:
  delete → item hidden from normal lists but present in /trash → restore →
  item reappears; and purge (permanent delete).

DB uses in-memory SQLite (see conftest.py) shared across the session, so each
test seeds a uniquely-identified SUPER_ADMIN and passes its id as the
X-Actor-Id header (overriding the client fixture's default) — this keeps the
/trash authorization independent of any user rows other tests have committed.
"""

import uuid
from datetime import UTC, datetime

import pytest

from app.db.models.cms import CmsBlogPost
from app.db.models.enums import (
    Difficulty,
    FileType,
    ParseStatus,
    Role,
    TestStatus,
    TestType,
)
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.test import Test
from app.db.models.user import User


@pytest.fixture
async def super_admin_headers(db_session) -> dict[str, str]:
    """Seed a fresh SUPER_ADMIN and return the X-Actor-Id header selecting it."""
    actor_id = str(uuid.uuid4())
    db_session.add(
        User(
            id=actor_id,
            email=f"trash-admin-{actor_id}@example.com",
            name="Trash Admin",
            password_hash="not-used",
            role=Role.SUPER_ADMIN,
        )
    )
    await db_session.commit()
    return {"X-Actor-Id": actor_id}


ACTOR_ID = "00000000-0000-0000-0000-000000000000"


async def _seed_jd(db_session, title="Backend Engineer") -> str:
    jd_id = str(uuid.uuid4())
    db_session.add(
        JobDescription(
            id=jd_id,
            uploaded_by=ACTOR_ID,
            original_filename="role.pdf",
            file_path="jds/role.pdf",
            file_type=FileType.PDF,
            raw_text="role",
            parse_status=ParseStatus.DONE,
        )
    )
    db_session.add(
        JdExtractedData(
            jd_id=jd_id,
            job_title=title,
            must_have_skills=[],
            nice_to_have_skills=[],
            tools_technologies=[],
            responsibilities=[],
            recommended_test_topics=[],
            difficulty_distribution={},
        )
    )
    await db_session.commit()
    return jd_id


async def _seed_test(db_session, jd_id: str) -> str:
    test_id = str(uuid.uuid4())
    db_session.add(
        Test(
            id=test_id,
            jd_id=jd_id,
            test_type=TestType.TECHNICAL,
            title="Technical Screening",
            duration_minutes=45,
            total_marks=50,
            difficulty=Difficulty.MIXED,
            status=TestStatus.DRAFT,
        )
    )
    await db_session.commit()
    return test_id


async def _seed_archived_blog_post(db_session) -> str:
    post_id = str(uuid.uuid4())
    db_session.add(
        CmsBlogPost(
            id=post_id,
            slug=f"trashed-post-{post_id}",
            title="Archived Product Update",
            excerpt="Archived post",
            content_md="This post was moved to trash.",
            tags=["product"],
            status="draft",
            archived_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    return post_id


class TestTrashFlow:
    async def test_jd_delete_hides_from_list_and_appears_in_trash(
        self, client, db_session, super_admin_headers
    ):
        jd_id = await _seed_jd(db_session)

        # Present in the normal list.
        listing = await client.get("/api/v1/jd/")
        assert jd_id in [item["id"] for item in listing.json()["items"]]

        # Soft-delete.
        resp = await client.delete(f"/api/v1/jd/{jd_id}")
        assert resp.status_code == 204

        # Gone from the normal list + detail 404s.
        listing = await client.get("/api/v1/jd/")
        assert jd_id not in [item["id"] for item in listing.json()["items"]]
        assert (await client.get(f"/api/v1/jd/{jd_id}")).status_code == 404

        # Shows up in the trash.
        trash = await client.get("/api/v1/trash", headers=super_admin_headers)
        assert trash.status_code == 200
        entry = next(i for i in trash.json()["items"] if i["id"] == jd_id)
        assert entry["entity_type"] == "jd"

        # Restore brings it back.
        restore = await client.post(
            f"/api/v1/trash/jd/{jd_id}/restore", headers=super_admin_headers
        )
        assert restore.status_code == 204
        listing = await client.get("/api/v1/jd/")
        assert jd_id in [item["id"] for item in listing.json()["items"]]
        trash = await client.get("/api/v1/trash", headers=super_admin_headers)
        assert jd_id not in [i["id"] for i in trash.json()["items"]]

    async def test_test_soft_delete_restore_and_purge(
        self, client, db_session, super_admin_headers
    ):
        jd_id = await _seed_jd(db_session)
        test_id = await _seed_test(db_session, jd_id)

        # Soft-delete removes it from the JD's test list.
        assert (await client.delete(f"/api/v1/tests/{test_id}")).status_code == 204
        tests = await client.get(f"/api/v1/tests/jd/{jd_id}")
        assert test_id not in [t["id"] for t in tests.json()]

        # In trash, then restore.
        trash = await client.get("/api/v1/trash", headers=super_admin_headers)
        assert test_id in [i["id"] for i in trash.json()["items"]]
        assert (
            await client.post(
                f"/api/v1/trash/test/{test_id}/restore", headers=super_admin_headers
            )
        ).status_code == 204
        tests = await client.get(f"/api/v1/tests/jd/{jd_id}")
        assert test_id in [t["id"] for t in tests.json()]

        # Delete again, then purge — gone from trash for good.
        await client.delete(f"/api/v1/tests/{test_id}")
        assert (
            await client.delete(
                f"/api/v1/trash/test/{test_id}", headers=super_admin_headers
            )
        ).status_code == 204
        trash = await client.get("/api/v1/trash", headers=super_admin_headers)
        assert test_id not in [i["id"] for i in trash.json()["items"]]
        # Restoring a purged item 404s.
        assert (
            await client.post(
                f"/api/v1/trash/test/{test_id}/restore", headers=super_admin_headers
            )
        ).status_code == 404

    async def test_unknown_entity_type_is_404(self, client, super_admin_headers):
        assert (
            await client.post(
                "/api/v1/trash/widget/abc/restore", headers=super_admin_headers
            )
        ).status_code == 404
        assert (
            await client.delete(
                "/api/v1/trash/widget/abc", headers=super_admin_headers
            )
        ).status_code == 404

    async def test_archived_blog_post_lists_in_trash_and_restores(
        self, client, db_session, super_admin_headers
    ):
        post_id = await _seed_archived_blog_post(db_session)

        trash = await client.get("/api/v1/trash", headers=super_admin_headers)
        assert trash.status_code == 200
        entry = next(i for i in trash.json()["items"] if i["id"] == post_id)
        assert entry["entity_type"] == "blog"
        assert entry["label"] == "Archived Product Update"
        assert entry["sublabel"] == f"trashed-post-{post_id}"

        restore = await client.post(
            f"/api/v1/trash/blog/{post_id}/restore", headers=super_admin_headers
        )
        assert restore.status_code == 204
        trash = await client.get("/api/v1/trash", headers=super_admin_headers)
        assert post_id not in [i["id"] for i in trash.json()["items"]]
