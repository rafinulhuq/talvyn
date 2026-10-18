import { apiClient, type ApiResult } from "@/lib/api/client";
import type {
  BlogPost,
  BlogPostInput,
  BlogPostListResponse,
  BlogPostStatus,
  CmsAuthorProfile,
  CmsAuthorProfileListResponse,
  CmsDocument,
  CmsDocumentKey,
  CmsDocumentListResponse,
  CmsMediaAsset,
  CmsPublishResponse,
  CmsVersionListResponse,
  JsonObject,
} from "@/types/cms";

type UploadApiBody = Partial<CmsMediaAsset> & {
  error?: { code: string; message: string; details?: Record<string, unknown> };
};

async function readUploadBody(res: Response): Promise<UploadApiBody> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {
      error: {
        code: "INVALID_RESPONSE",
        message: text || "Server returned an invalid response.",
      },
    };
  }
}

const CMP_API_PREFIX = "/api/v1/cmp";

export const cmpApi = {
  listDocuments(): Promise<ApiResult<CmsDocumentListResponse>> {
    return apiClient.get<CmsDocumentListResponse>(`${CMP_API_PREFIX}/documents`);
  },

  getDocument(key: CmsDocumentKey): Promise<ApiResult<CmsDocument>> {
    return apiClient.get<CmsDocument>(`${CMP_API_PREFIX}/documents/${key}`);
  },

  updateDocument(key: CmsDocumentKey, draft: JsonObject): Promise<ApiResult<CmsDocument>> {
    return apiClient.patch<CmsDocument>(`${CMP_API_PREFIX}/documents/${key}`, {
      draft_json: draft,
    });
  },

  publishDocument(key: CmsDocumentKey): Promise<ApiResult<CmsPublishResponse>> {
    return apiClient.post<CmsPublishResponse>(`${CMP_API_PREFIX}/documents/${key}/publish`);
  },

  listVersions(
    key: CmsDocumentKey,
    { limit = 5, offset = 0 }: { limit?: number; offset?: number } = {}
  ): Promise<ApiResult<CmsVersionListResponse>> {
    return apiClient.get<CmsVersionListResponse>(
      `${CMP_API_PREFIX}/documents/${key}/versions?limit=${limit}&offset=${offset}`
    );
  },

  restoreVersion(key: CmsDocumentKey, version: number): Promise<ApiResult<CmsDocument>> {
    return apiClient.post<CmsDocument>(`${CMP_API_PREFIX}/documents/${key}/restore-version`, {
      version,
    });
  },

  listBlogPosts(
    params: { status?: BlogPostStatus; search?: string; limit?: number; offset?: number } = {}
  ): Promise<ApiResult<BlogPostListResponse>> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    query.set("limit", String(params.limit ?? 20));
    query.set("offset", String(params.offset ?? 0));
    return apiClient.get<BlogPostListResponse>(`${CMP_API_PREFIX}/blog?${query.toString()}`);
  },

  getBlogPost(postId: string): Promise<ApiResult<BlogPost>> {
    return apiClient.get<BlogPost>(`${CMP_API_PREFIX}/blog/${postId}`);
  },

  createBlogPost(data: BlogPostInput & { title: string }): Promise<ApiResult<BlogPost>> {
    return apiClient.post<BlogPost>(`${CMP_API_PREFIX}/blog`, data);
  },

  updateBlogPost(postId: string, data: BlogPostInput): Promise<ApiResult<BlogPost>> {
    return apiClient.patch<BlogPost>(`${CMP_API_PREFIX}/blog/${postId}`, data);
  },

  publishBlogPost(postId: string, publishAt?: string): Promise<ApiResult<BlogPost>> {
    return apiClient.post<BlogPost>(
      `${CMP_API_PREFIX}/blog/${postId}/publish`,
      publishAt ? { publish_at: publishAt } : undefined
    );
  },

  unpublishBlogPost(postId: string): Promise<ApiResult<BlogPost>> {
    return apiClient.post<BlogPost>(`${CMP_API_PREFIX}/blog/${postId}/unpublish`);
  },

  archiveBlogPost(postId: string): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`${CMP_API_PREFIX}/blog/${postId}`);
  },

  listAuthors(): Promise<ApiResult<CmsAuthorProfileListResponse>> {
    return apiClient.get<CmsAuthorProfileListResponse>(`${CMP_API_PREFIX}/authors`);
  },

  createAuthor(data: {
    name: string;
    avatar_asset_id?: string | null;
  }): Promise<ApiResult<CmsAuthorProfile>> {
    return apiClient.post<CmsAuthorProfile>(`${CMP_API_PREFIX}/authors`, data);
  },

  async uploadMedia(
    file: File,
    data: { title?: string; altText?: string }
  ): Promise<ApiResult<CmsMediaAsset>> {
    const formData = new FormData();
    formData.append("file", file);
    if (data.title) formData.append("title", data.title);
    if (data.altText) formData.append("alt_text", data.altText);

    try {
      const res = await fetch("/api/cmp/media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await readUploadBody(res);
        return {
          success: false,
          statusCode: res.status,
          error: body.error ?? {
            code: "CMP_UPLOAD_FAILED",
            message: "Could not upload this media asset.",
          },
        };
      }

      const body = await readUploadBody(res);
      return { success: true, data: body as CmsMediaAsset };
    } catch (err) {
      return {
        success: false,
        statusCode: 0,
        error: {
          code: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Network request failed.",
        },
      };
    }
  },
};
