"""Integration tests for the superadmin CMP API."""

from httpx import AsyncClient

from app.db.models.cms import (  # noqa: F401
    CmsContentDocument,
    CmsContentVersion,
    CmsMediaAsset,
)
from app.db.models.enums import Role
from app.db.models.user import User
from app.services.cms_service import render_html_template

ACTOR_ID = "00000000-0000-0000-0000-000000000000"


async def _seed_actor(db_session, *, role: Role = Role.SUPER_ADMIN, active: bool = True) -> None:
    existing = await db_session.get(User, ACTOR_ID)
    if existing is None:
        db_session.add(
            User(
                id=ACTOR_ID,
                email="cmp-admin@example.com",
                name="CMP Admin",
                password_hash="not-used",
                role=role,
                is_active=active,
            )
        )
    else:
        existing.email = "cmp-admin@example.com"
        existing.name = "CMP Admin"
        existing.password_hash = "not-used"
        existing.role = role
        existing.is_active = active
    await db_session.commit()


class TestCmsSuperadminAuth:
    async def test_cms_routes_require_existing_active_superadmin(
        self, client: AsyncClient, db_session
    ):
        missing_actor = await client.get("/api/v1/cmp/documents")
        assert missing_actor.status_code == 401

        await _seed_actor(db_session, role=Role.ADMIN)
        normal_admin = await client.get("/api/v1/cmp/documents")
        assert normal_admin.status_code == 403

    async def test_superadmin_can_list_seeded_documents(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)

        resp = await client.get("/api/v1/cmp/documents")
        legacy_resp = await client.get("/api/v1/cms/documents")

        assert resp.status_code == 200
        assert legacy_resp.status_code == 200
        keys = {item["key"] for item in resp.json()["items"]}
        assert keys == {"site", "home", "candidate_experience", "invitation_email"}


class TestCmsPublishing:
    async def test_draft_publish_restore_and_public_visibility(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        v1 = {"brand": {"name": "AlphaVETT"}, "metadata": {"title": "AlphaVETT"}}
        draft_resp = await client.patch(
            "/api/v1/cmp/documents/site",
            json={"draft_json": v1},
        )
        assert draft_resp.status_code == 200
        assert draft_resp.json()["has_unpublished_changes"] is True

        public_before = await client.get("/api/v1/cmp/public/content")
        assert public_before.status_code == 200
        assert public_before.json()["site"]["brand"]["name"] == "Talvyn"

        publish_v1 = await client.post("/api/v1/cmp/documents/site/publish")
        assert publish_v1.status_code == 200
        assert publish_v1.json()["version"]["version"] == 1

        v2 = {"brand": {"name": "BetaVETT"}, "metadata": {"title": "BetaVETT"}}
        await client.patch("/api/v1/cmp/documents/site", json={"draft_json": v2})
        publish_v2 = await client.post("/api/v1/cmp/documents/site/publish")
        assert publish_v2.status_code == 200

        public_v2 = await client.get("/api/v1/cmp/public/content")
        assert public_v2.json()["site"]["brand"]["name"] == "BetaVETT"

        restored = await client.post(
            "/api/v1/cmp/documents/site/restore-version",
            json={"version": 1},
        )
        assert restored.status_code == 200
        assert restored.json()["draft_json"]["brand"]["name"] == "AlphaVETT"
        assert restored.json()["has_unpublished_changes"] is True

        public_still_v2 = await client.get("/api/v1/cmp/public/content")
        assert public_still_v2.json()["site"]["brand"]["name"] == "BetaVETT"

        publish_restored = await client.post("/api/v1/cmp/documents/site/publish")
        assert publish_restored.status_code == 200
        assert publish_restored.json()["version"]["version"] == 3

        versions = await client.get("/api/v1/cmp/documents/site/versions")
        assert [item["version"] for item in versions.json()["items"]] == [3, 2, 1]

    async def test_republish_without_changes_reuses_latest_version(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        await client.patch(
            "/api/v1/cmp/documents/site",
            json={"draft_json": {"brand": {"name": "SameVETT"}}},
        )
        first = await client.post("/api/v1/cmp/documents/site/publish")
        assert first.json()["version"]["version"] == 1

        second = await client.post("/api/v1/cmp/documents/site/publish")
        assert second.status_code == 200
        assert second.json()["version"]["version"] == 1

        versions = await client.get("/api/v1/cmp/documents/site/versions")
        assert versions.json()["total"] == 1

    async def test_version_list_is_paginated_and_metadata_only(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        for i in range(7):
            await client.patch(
                "/api/v1/cmp/documents/site",
                json={"draft_json": {"brand": {"name": f"Brand{i}"}}},
            )
            await client.post("/api/v1/cmp/documents/site/publish")

        page1 = await client.get("/api/v1/cmp/documents/site/versions?limit=5")
        body = page1.json()
        assert body["total"] == 7
        assert [item["version"] for item in body["items"]] == [7, 6, 5, 4, 3]
        assert body["items"][0]["is_current"] is True
        assert body["items"][1]["is_current"] is False
        assert body["items"][0]["created_by_name"] == "CMP Admin"
        assert "content_json" not in body["items"][0]

        page2 = await client.get("/api/v1/cmp/documents/site/versions?limit=5&offset=5")
        assert [item["version"] for item in page2.json()["items"]] == [2, 1]

        single = await client.get("/api/v1/cmp/documents/site/versions/3")
        assert single.status_code == 200
        assert single.json()["content_json"]["brand"]["name"] == "Brand2"

        missing = await client.get("/api/v1/cmp/documents/site/versions/99")
        assert missing.status_code == 404

    async def test_public_content_hides_email_templates(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)

        resp = await client.patch(
            "/api/v1/cmp/documents/invitation_email",
            json={"draft_json": {"subject": "Private subject: {candidateName}"}},
        )
        assert resp.status_code == 200
        assert (await client.post("/api/v1/cmp/documents/invitation_email/publish")).status_code == 200

        public_resp = await client.get("/api/v1/cmp/public/content")
        assert public_resp.status_code == 200
        assert "invitation_email" not in public_resp.json()

    async def test_validation_rejects_unsafe_links_and_icons(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        unsafe_link = await client.patch(
            "/api/v1/cmp/documents/site",
            json={"draft_json": {"navLinks": [{"label": "Bad", "href": "javascript:alert(1)"}]}},
        )
        assert unsafe_link.status_code == 422
        assert unsafe_link.json()["error"]["code"] == "CMS_UNSAFE_LINK"

        invalid_icon = await client.patch(
            "/api/v1/cmp/documents/home",
            json={"draft_json": {"stats": [{"value": "1", "label": "Bad", "icon": "skull"}]}},
        )
        assert invalid_icon.status_code == 422
        assert invalid_icon.json()["error"]["code"] == "CMS_INVALID_ICON"


class TestCmsMedia:
    async def test_media_upload_and_serves_content(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)
        content = b"\x89PNG\r\n\x1a\ntalvyn"

        upload = await client.post(
            "/api/v1/cmp/media",
            files={"file": ("hero.png", content, "image/png")},
            data={"title": "Hero", "alt_text": "Hero image"},
        )

        assert upload.status_code == 201
        asset = upload.json()
        assert asset["url"] == f"/api/cmp/media/{asset['id']}"

        served = await client.get(f"/api/v1/cmp/media/{asset['id']}/content")
        assert served.status_code == 200
        assert served.content == content

        backup = await client.get("/api/v1/admin/backup")
        assert backup.status_code == 200
        assert len(backup.json()["tables"]["cms_media_assets"]) == 1
        assert any(file["path"] == asset["storage_key"] for file in backup.json()["files"])


def test_email_html_template_escapes_variables_and_template_text():
    rendered = render_html_template(
        "Hi {candidateName}, <strong>{jdTitle}</strong>",
        {"candidateName": "<script>alert(1)</script>", "jdTitle": "Backend <Lead>"},
    )

    assert "<script>" not in rendered
    assert "<strong>" not in rendered
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in rendered
    assert "Backend &lt;Lead&gt;" in rendered
