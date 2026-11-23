/**
 * Candidate-side API calls through /api/candidate. No session: the magic-link
 * token is in an httpOnly cookie and the server route attaches it upstream.
 * Save, heartbeat and event calls never throw; a failure must not interrupt a test.
 */
import { api, type ApiResult } from "@/lib/api/client";
import type { AnswerPayload, AttemptState, ExamSection, ExamStatus, HeartbeatResult, IntegrityEvent, SectionSubmitResult, SectionType, StartAttemptResult, SubmitResult } from "@/types/attempt";

const call = <T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<ApiResult<T>> =>
  api<T>(path, {
    base: "/api/candidate",
    method: init.method ?? "GET",
    body: init.body,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });

export const attempts = {
  start: (testIndex: number) => call<StartAttemptResult>("/api/v1/attempts/start", { method: "POST", body: { test_index: testIndex } }),
  state: (id: string) => call<AttemptState>(`/api/v1/attempts/${id}/state`),
  bulkSave: (id: string, answers: AnswerPayload[]) => call<{ saved_count: number }>(`/api/v1/attempts/${id}/bulk-save`, { method: "POST", body: { answers } }),
  heartbeat: (id: string, remaining: number) =>
    call<HeartbeatResult>(`/api/v1/attempts/${id}/heartbeat`, { method: "POST", body: { client_time_remaining_seconds: Math.max(0, Math.round(remaining)) } }),
  submit: (id: string, answers: AnswerPayload[], auto: boolean) =>
    call<SubmitResult>(`/api/v1/attempts/${id}/submit`, { method: "POST", body: { answers, auto_submitted: auto }, timeoutMs: 30_000 }),
  event: (id: string, type: IntegrityEvent, metadata?: Record<string, unknown>) =>
    call(`/api/v1/attempts/${id}/event`, { method: "POST", body: { event_type: type, metadata: metadata ?? null } }),
  /** Retries once; the caller has already locked the screen either way. */
  async terminate(id: string, reason: IntegrityEvent) {
    for (let i = 0; i < 2; i++) {
      const r = await call(`/api/v1/attempts/${id}/terminate`, { method: "POST", body: { reason } });
      if (r.ok) return r;
    }
    return null;
  },
};

export const exams = {
  start: () => call<ExamSection>("/api/v1/candidate-exams/start", { method: "POST", body: {} }),
  current: (examId: string) => call<ExamSection>(`/api/v1/candidate-exams/${examId}/current`),
  submitSection: (examId: string, section: SectionType, answers: AnswerPayload[], auto: boolean) =>
    call<SectionSubmitResult>(`/api/v1/candidate-exams/${examId}/section/${section}/submit`, { method: "POST", body: { answers, auto_submitted: auto }, timeoutMs: 30_000 }),
  submit: (examId: string) => call(`/api/v1/candidate-exams/${examId}/submit`, { method: "POST", body: {} }),
  status: (examId: string) => call<ExamStatus>(`/api/v1/candidate-exams/${examId}/status`),
};
