// Mirrors backend/app/schemas/cms_blog.py
export type PublicPostSummary = {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  tags: string[];
  author_name: string | null;
  author_avatar_url: string | null;
  published_at: string | null;
  reading_minutes: number;
  claps: number;
};
export type PublicPost = PublicPostSummary & { content_md: string; seo_title: string | null; seo_description: string | null };
export type PublicPostList = { items: PublicPostSummary[]; total: number };

export type AdminPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string;
  cover_image_asset_id: string | null;
  cover_image_url: string | null;
  tags: string[];
  status: "draft" | "published" | string;
  author_profile_id: string | null;
  author_name: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
};
export type AdminPostSummary = Pick<AdminPost, "id" | "slug" | "title" | "excerpt" | "cover_image_url" | "tags" | "status" | "author_name" | "created_at" | "updated_at" | "published_at">;
export type Author = { id: string; name: string; avatar_url: string | null };

/** draft; published and live; or published with a future date (scheduled). */
export function postState(p: Pick<AdminPost, "status" | "published_at">): { label: string; tone: "neutral" | "success" | "accent" } {
  if (p.status !== "published") return { label: "Draft", tone: "neutral" };
  if (p.published_at && new Date(p.published_at).getTime() > Date.now()) return { label: "Scheduled", tone: "accent" };
  return { label: "Published", tone: "success" };
}
