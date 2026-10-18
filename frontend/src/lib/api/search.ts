import { apiClient, type ApiResult } from "./client";
import type { SearchResponse } from "@/types/search";

export const searchApi = {
  async global(query: string, limitPerGroup = 5): Promise<ApiResult<SearchResponse>> {
    const params = new URLSearchParams({
      query,
      limit_per_group: String(limitPerGroup),
    });
    // No trailing slash before the query string — see the comment in
    // candidates.ts's `list()` for why: the catch-all proxy route never
    // preserves one anyway, so requesting with one just adds an avoidable
    // browser-level redirect hop.
    return apiClient.get<SearchResponse>(`/api/v1/search?${params}`);
  },
};
