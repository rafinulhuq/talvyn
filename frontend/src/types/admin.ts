export interface ResetDataResponse {
  deleted_counts: Record<string, number>;
  deleted_files: number;
  message: string;
}

export interface BackupFile {
  path: string;
  content_type: string | null;
  size_bytes: number;
  content_base64: string;
}

export interface BackupPayload {
  version: number;
  created_at: string;
  tables: Record<string, Record<string, unknown>[]>;
  files: BackupFile[];
}

export interface RestoreDataResponse {
  restored_counts: Record<string, number>;
  restored_files: number;
  message: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
