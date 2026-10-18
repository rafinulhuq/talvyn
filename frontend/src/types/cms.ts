import type { CmsDocumentKey } from "@/lib/cms/content";

export type { CmsDocumentKey };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface CmsDocument {
  id: string;
  key: CmsDocumentKey;
  draft_json: JsonObject;
  published_json: JsonObject | null;
  updated_by: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  latest_version: number;
  has_unpublished_changes: boolean;
}

export interface CmsContentVersion {
  id: string;
  document_id: string;
  document_key: CmsDocumentKey;
  version: number;
  content_json: JsonObject;
  created_by: string | null;
  created_at: string;
}

export interface CmsDocumentListResponse {
  items: CmsDocument[];
}

export interface CmsVersionMeta {
  id: string;
  document_id: string;
  document_key: CmsDocumentKey;
  version: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  is_current: boolean;
}

export interface CmsVersionListResponse {
  items: CmsVersionMeta[];
  total: number;
}

export interface CmsPublishResponse {
  document: CmsDocument;
  version: CmsContentVersion;
}

export interface CmsMediaAsset {
  id: string;
  storage_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  title: string | null;
  alt_text: string | null;
  url: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CmsAuthorProfile {
  id: string;
  name: string;
  avatar_asset_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CmsAuthorProfileListResponse {
  items: CmsAuthorProfile[];
}

export type BlogPostStatus = "draft" | "published";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string;
  cover_image_asset_id: string | null;
  cover_image_url: string | null;
  tags: string[];
  status: BlogPostStatus;
  author_id: string | null;
  author_name: string | null;
  author_profile_id: string | null;
  author_avatar_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  tags: string[];
  status: BlogPostStatus;
  author_name: string | null;
  author_avatar_url: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface BlogPostListResponse {
  items: BlogPostSummary[];
  total: number;
}

export interface BlogPostInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content_md?: string;
  cover_image_asset_id?: string | null;
  clear_cover_image?: boolean;
  author_profile_id?: string | null;
  clear_author_profile?: boolean;
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
}

export interface PublicBlogPostSummary {
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
}

export interface PublicBlogPost extends PublicBlogPostSummary {
  content_md: string;
  seo_title: string | null;
  seo_description: string | null;
}

export interface PublicBlogListResponse {
  items: PublicBlogPostSummary[];
  total: number;
}
