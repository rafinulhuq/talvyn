"""blog claps column + backfill blog nav links and home section

Adds cms_blog_posts.clap_count, and backfills existing CMS site/home
documents (draft and published) so the blog is reachable on deployments
whose site content was published before the blog existed: appends the
Blog link to navLinks/footerLinks and the 'blog' section to the
homepage sectionOrder, when missing. Idempotent — reruns change nothing.

Revision ID: b2e5f7a9c1d3
Revises: f8c4d2a1b7e9
Create Date: 2026-07-06
"""

import json
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b2e5f7a9c1d3"
down_revision: Union[str, None] = "f8c4d2a1b7e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BLOG_LINK = {"label": "Blog", "href": "/blog"}


def _loads(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def _with_blog_link(content: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    changed = False
    for key in ("navLinks", "footerLinks"):
        links = content.get(key)
        if not isinstance(links, list):
            continue
        if any(isinstance(link, dict) and link.get("href") == "/blog" for link in links):
            continue
        # Keep "Log in" last in the footer when present.
        insert_at = len(links)
        for i, link in enumerate(links):
            if isinstance(link, dict) and link.get("href") == "/login":
                insert_at = i
                break
        links.insert(insert_at, dict(BLOG_LINK))
        changed = True
    return content, changed


def _with_blog_section(content: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    order = content.get("sectionOrder")
    if not isinstance(order, list) or "blog" in order:
        return content, False
    # Surface posts near the bottom of the page, before the final CTA.
    insert_at = len(order)
    if "finalCta" in order:
        insert_at = order.index("finalCta")
    order.insert(insert_at, "blog")
    return content, True


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE cms_blog_posts ADD COLUMN IF NOT EXISTS clap_count INTEGER NOT NULL DEFAULT 0"
    ))

    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, key, draft_json, published_json FROM cms_content_documents "
        "WHERE key IN ('site', 'home')"
    )).mappings().all()

    for row in rows:
        patch = _with_blog_link if row["key"] == "site" else _with_blog_section
        updates: dict[str, Any] = {}
        for column in ("draft_json", "published_json"):
            content = _loads(row[column])
            if not isinstance(content, dict):
                continue
            content, changed = patch(content)
            if changed:
                updates[column] = json.dumps(content)
        if updates:
            assignments = ", ".join(f"{column} = CAST(:{column} AS JSONB)" for column in updates)
            bind.execute(
                sa.text(f"UPDATE cms_content_documents SET {assignments} WHERE id = :id"),
                {**updates, "id": row["id"]},
            )


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE cms_blog_posts DROP COLUMN IF EXISTS clap_count"))
    # The nav/section backfill is content, not schema — leave it in place.
