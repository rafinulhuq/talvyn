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
