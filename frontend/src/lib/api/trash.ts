/**
 * Trash (soft-delete / recycle-bin) API client.
 */

import { apiClient, type ApiResult } from "./client";

export type TrashEntityType = "jd" | "test" | "candidate" | "blog";

export interface TrashItem {
  entity_type: TrashEntityType;
  id: string;
  label: string;
  sublabel: string | null;
  deleted_at: string;
}

export interface TrashListData {
  items: TrashItem[];
  total: number;
}

export const trashApi = {
  async list(): Promise<ApiResult<TrashListData>> {
    return apiClient.get<TrashListData>("/api/v1/trash");
  },

  async restore(
    entityType: TrashEntityType,
    id: string
  ): Promise<ApiResult<void>> {
    return apiClient.post<void>(`/api/v1/trash/${entityType}/${id}/restore`);
  },

  async purge(
    entityType: TrashEntityType,
    id: string
  ): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`/api/v1/trash/${entityType}/${id}`);
  },
};
