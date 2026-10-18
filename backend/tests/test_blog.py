"""Integration tests for the CMP blog API."""

from httpx import AsyncClient

from app.db.models.enums import Role
from app.db.models.user import User
from app.services.blog_service import slugify

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
                email="blog-admin@example.com",
                name="Blog Admin",
                password_hash="not-used",
                role=role,
                is_active=True,
            )
        )
    else:
        existing.role = role
        existing.is_active = True
        existing.name = "Blog Admin"
    await db_session.commit()


def test_slugify():
    assert slugify("Hello, World!") == "hello-world"
    assert slugify("  Fancy — Título 42 ") == "fancy-t-tulo-42"
    assert slugify("---") == ""


class TestBlogAuth:
    async def test_admin_blog_routes_require_superadmin(self, client: AsyncClient, db_session):
        await _remove_actor(db_session)
        assert (await client.get("/api/v1/cmp/blog")).status_code == 401

        await _seed_actor(db_session, role=Role.ADMIN)
        assert (await client.get("/api/v1/cmp/blog")).status_code == 403

    async def test_public_blog_routes_do_not_require_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/cmp/public/blog")
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}


class TestBlogCrud:
    async def test_create_update_publish_lifecycle(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)

        created = await client.post(
            "/api/v1/cmp/blog",
            json={
                "title": "Hiring Signals That Matter",
                "excerpt": "What actually predicts performance.",
                "content_md": "# Signals\n\nStructured interviews win.",
                "tags": ["Hiring", "hiring", "AI"],
            },
        )
        assert created.status_code == 201
        post = created.json()
        assert post["slug"] == "hiring-signals-that-matter"
        assert post["status"] == "draft"
        assert post["tags"] == ["Hiring", "AI"]
        assert post["author_name"] == "Blog Admin"

        # Draft posts are invisible publicly.
        assert (await client.get("/api/v1/cmp/public/blog")).json()["total"] == 0
        hidden = await client.get(f"/api/v1/cmp/public/blog/{post['slug']}")
        assert hidden.status_code == 404

        published = await client.post(f"/api/v1/cmp/blog/{post['id']}/publish")
        assert published.status_code == 200
        assert published.json()["status"] == "published"
        assert published.json()["published_at"] is not None

        public_list = await client.get("/api/v1/cmp/public/blog")
        assert public_list.json()["total"] == 1
        summary = public_list.json()["items"][0]
        assert summary["slug"] == post["slug"]
        assert "content_md" not in summary

        public_post = await client.get(f"/api/v1/cmp/public/blog/{post['slug']}")
        assert public_post.status_code == 200
        assert "Structured interviews" in public_post.json()["content_md"]

        unpublished = await client.post(f"/api/v1/cmp/blog/{post['id']}/unpublish")
        assert unpublished.status_code == 200
        assert unpublished.json()["status"] == "draft"
        assert (await client.get(f"/api/v1/cmp/public/blog/{post['slug']}")).status_code == 404

    async def test_slug_uniqueness_and_updates(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)

        first = (await client.post("/api/v1/cmp/blog", json={"title": "Same Title"})).json()
        second = (await client.post("/api/v1/cmp/blog", json={"title": "Same Title"})).json()
        assert first["slug"] == "same-title"
        assert second["slug"] == "same-title-2"

        renamed = await client.patch(
            f"/api/v1/cmp/blog/{second['id']}",
            json={"slug": "A Custom Slug!", "title": "Renamed"},
        )
        assert renamed.status_code == 200
        assert renamed.json()["slug"] == "a-custom-slug"
        assert renamed.json()["title"] == "Renamed"

    async def test_publish_requires_content_and_blocks_scripts(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        empty = (await client.post("/api/v1/cmp/blog", json={"title": "Empty"})).json()
        publish_empty = await client.post(f"/api/v1/cmp/blog/{empty['id']}/publish")
        assert publish_empty.status_code == 422
        assert publish_empty.json()["error"]["code"] == "CMS_BLOG_EMPTY"

        unsafe = await client.post(
            "/api/v1/cmp/blog",
            json={"title": "Nope", "content_md": "hello <script>alert(1)</script>"},
        )
        assert unsafe.status_code == 422
        assert unsafe.json()["error"]["code"] == "CMS_UNSAFE_TEXT"

    async def test_admin_list_filters_and_archive(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)

        keep = (
            await client.post(
                "/api/v1/cmp/blog",
                json={"title": "Interview Loops", "content_md": "body"},
            )
        ).json()
        gone = (
            await client.post(
                "/api/v1/cmp/blog",
                json={"title": "Old News", "content_md": "body"},
            )
        ).json()
        await client.post(f"/api/v1/cmp/blog/{keep['id']}/publish")

        published_only = await client.get("/api/v1/cmp/blog?status=published")
        assert [item["id"] for item in published_only.json()["items"]] == [keep["id"]]

        searched = await client.get("/api/v1/cmp/blog?search=interview")
        assert [item["id"] for item in searched.json()["items"]] == [keep["id"]]

        assert (await client.delete(f"/api/v1/cmp/blog/{gone['id']}")).status_code == 204
        remaining = await client.get("/api/v1/cmp/blog")
        assert [item["id"] for item in remaining.json()["items"]] == [keep["id"]]
        assert (await client.get(f"/api/v1/cmp/blog/{gone['id']}")).status_code == 404

    async def test_public_payloads_include_reading_time_and_claps(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        body = " ".join(["word"] * 660)  # ~3 minutes at 220 wpm
        post = (
            await client.post(
                "/api/v1/cmp/blog",
                json={"title": "Long Read", "content_md": body},
            )
        ).json()
        await client.post(f"/api/v1/cmp/blog/{post['id']}/publish")

        summary = (await client.get("/api/v1/cmp/public/blog")).json()["items"][0]
        assert summary["reading_minutes"] == 3
        assert summary["claps"] == 0

        clap_default = await client.post(f"/api/v1/cmp/public/blog/{post['slug']}/clap", json={})
        assert clap_default.status_code == 200
        assert clap_default.json()["claps"] == 1

        clap_many = await client.post(
            f"/api/v1/cmp/public/blog/{post['slug']}/clap", json={"count": 50}
        )
        assert clap_many.json()["claps"] == 51

        too_many = await client.post(
            f"/api/v1/cmp/public/blog/{post['slug']}/clap", json={"count": 51}
        )
        assert too_many.status_code == 422

        await client.post(f"/api/v1/cmp/blog/{post['id']}/unpublish")
        hidden = await client.post(f"/api/v1/cmp/public/blog/{post['slug']}/clap", json={})
        assert hidden.status_code == 404

    async def test_public_list_pagination_and_tag_filter(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)

        for i in range(4):
            tags = ["ai"] if i % 2 == 0 else ["hiring"]
            post = (
                await client.post(
                    "/api/v1/cmp/blog",
                    json={"title": f"Post {i}", "content_md": "body", "tags": tags},
                )
            ).json()
            await client.post(f"/api/v1/cmp/blog/{post['id']}/publish")

        page = await client.get("/api/v1/cmp/public/blog?limit=3")
        assert page.json()["total"] == 4
        assert len(page.json()["items"]) == 3

        tagged = await client.get("/api/v1/cmp/public/blog?tag=AI")
        assert tagged.json()["total"] == 2


class TestBlogPostByline:
    async def test_post_with_no_profile_falls_back_to_creator_name(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        created = await client.post(
            "/api/v1/cmp/blog", json={"title": "No Profile Post", "content_md": "Body"}
        )
        assert created.status_code == 201
        body = created.json()
        assert body["author_name"] == "Blog Admin"
        assert body["author_profile_id"] is None
        assert body["author_avatar_url"] is None

    async def test_post_with_profile_displays_profile_name(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        profile = (
            await client.post("/api/v1/cmp/authors", json={"name": "Talvyn Team"})
        ).json()

        created = await client.post(
            "/api/v1/cmp/blog",
            json={
                "title": "Team Post",
                "content_md": "Body",
                "author_profile_id": profile["id"],
            },
        )
        assert created.status_code == 201
        assert created.json()["author_name"] == "Talvyn Team"
        assert created.json()["author_profile_id"] == profile["id"]

    async def test_archived_profile_still_resolves_on_existing_posts(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        profile = (
            await client.post("/api/v1/cmp/authors", json={"name": "Guest Author"})
        ).json()
        post = (
            await client.post(
                "/api/v1/cmp/blog",
                json={
                    "title": "Guest Post",
                    "content_md": "Body",
                    "author_profile_id": profile["id"],
                },
            )
        ).json()

        assert (await client.delete(f"/api/v1/cmp/authors/{profile['id']}")).status_code == 204

        fetched = await client.get(f"/api/v1/cmp/blog/{post['id']}")
        assert fetched.json()["author_name"] == "Guest Author"
        assert (await client.get("/api/v1/cmp/authors")).json()["items"] == []

    async def test_unknown_author_profile_id_is_rejected(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        resp = await client.post(
            "/api/v1/cmp/blog",
            json={
                "title": "Bad Profile Post",
                "content_md": "Body",
                "author_profile_id": "does-not-exist",
            },
        )
        assert resp.status_code == 404


class TestBlogScheduling:
    async def test_schedule_for_future_hides_post_until_due(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        from datetime import UTC, datetime, timedelta

        post = (
            await client.post(
                "/api/v1/cmp/blog", json={"title": "Future Post", "content_md": "Body"}
            )
        ).json()

        future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        scheduled = await client.post(
            f"/api/v1/cmp/blog/{post['id']}/publish", json={"publish_at": future}
        )
        assert scheduled.status_code == 200
        assert scheduled.json()["status"] == "published"

        # Not visible publicly yet — its published_at is in the future.
        assert (await client.get("/api/v1/cmp/public/blog")).json()["total"] == 0
        assert (
            await client.get(f"/api/v1/cmp/public/blog/{post['slug']}")
        ).status_code == 404

        # But the admin editor can see it as published (with a future date).
        admin_view = await client.get(f"/api/v1/cmp/blog/{post['id']}")
        assert admin_view.json()["status"] == "published"

    async def test_publish_now_on_a_scheduled_post_makes_it_live_immediately(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        from datetime import UTC, datetime, timedelta

        post = (
            await client.post(
                "/api/v1/cmp/blog", json={"title": "Push Live", "content_md": "Body"}
            )
        ).json()
        future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={"publish_at": future})

        pushed_live = await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={})
        assert pushed_live.status_code == 200

        assert (await client.get("/api/v1/cmp/public/blog")).json()["total"] == 1

    async def test_immediate_publish_unaffected_by_scheduling_change(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        post = (
            await client.post(
                "/api/v1/cmp/blog", json={"title": "Normal Post", "content_md": "Body"}
            )
        ).json()
        published = await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={})
        assert published.status_code == 200
        assert (await client.get("/api/v1/cmp/public/blog")).json()["total"] == 1

        already_live = await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={})
        assert already_live.status_code == 409
