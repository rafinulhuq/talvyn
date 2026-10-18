import { apiClient, type ApiResult } from "./client";
import type {
  AuditLogListResponse,
  BackupPayload,
  ResetDataResponse,
  RestoreDataResponse,
} from "@/types/admin";

export const adminApi = {
  createBackup(): Promise<ApiResult<BackupPayload>> {
    return apiClient.get<BackupPayload>("/api/v1/admin/backup");
  },

  listAuditLog(
    page: number = 1,
    pageSize: number = 20
  ): Promise<ApiResult<AuditLogListResponse>> {
    return apiClient.get<AuditLogListResponse>(
      `/api/v1/admin/audit-log?page=${page}&page_size=${pageSize}`
    );
  },

  resetData(confirm: string): Promise<ApiResult<ResetDataResponse>> {
    return apiClient.post<ResetDataResponse>("/api/v1/admin/reset-data", {
      confirm,
    });
  },

  restoreData(
    confirm: string,
    backup: BackupPayload
  ): Promise<ApiResult<RestoreDataResponse>> {
    return apiClient.post<RestoreDataResponse>("/api/v1/admin/restore-data", {
      confirm,
      backup,
    });
  },
};
