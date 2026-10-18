/**
 * Attempts API client.
 *
 * These calls go through the public candidate proxy in Next.js. They do
 * not use the admin X-Internal-Token, and since A8-4 the browser never
 * handles the magic-link token at all: it lives in an httpOnly cookie
 * (set by middleware when the emailed link is opened) and the proxy
 * injects it upstream as X-Attempt-Token / the /start body token.
 *
 * Base URL: /api/candidate
 */

import axios from "axios";
import type {
  AttemptStateResponse,
  BulkSaveRequest,
  BulkSaveResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  SaveAnswerRequest,
  SaveAnswerResponse,
  StartAttemptRequest,
  StartAttemptResponse,
  SubmitAttemptRequest,
  SubmitAttemptResponse,
  SuspiciousEventRequest,
  TerminateAttemptRequest,
  TerminateAttemptResponse,
} from "@/types/attempt";

// Public same-origin proxy — no admin session, no internal token in the
// browser. withCredentials is implicit for same-origin requests, so the
// httpOnly attempt-token cookie rides along automatically.
const candidateClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CANDIDATE_API_URL ?? "/api/candidate",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

export const attemptsApi = {
  /** Start or resume a test attempt. Returns questions (correct answers stripped). */
  async start(req: StartAttemptRequest): Promise<StartAttemptResponse> {
    const { data } = await candidateClient.post<StartAttemptResponse>(
      "/api/v1/attempts/start",
      req
    );
    return data;
  },

  /** Get current attempt state (for page-refresh resume). */
  async getState(attemptId: string): Promise<AttemptStateResponse> {
    const { data } = await candidateClient.get<AttemptStateResponse>(
      `/api/v1/attempts/${attemptId}/state`
    );
    return data;
  },

  /** Autosave a single answer. Silently swallows errors. */
  async saveAnswer(
    attemptId: string,
    answer: SaveAnswerRequest
  ): Promise<SaveAnswerResponse | null> {
    try {
      const { data } = await candidateClient.post<SaveAnswerResponse>(
        `/api/v1/attempts/${attemptId}/answer`,
        answer
      );
      return data;
    } catch {
      return null; // Never crash the test for a save failure
    }
  },

  /**
   * Autosave multiple answers in a single request.
   * Replaces the old pattern of calling saveAnswer() N times in parallel.
   * Silently swallows errors — a save failure must never interrupt the test.
   */
  async bulkSave(
    attemptId: string,
    req: BulkSaveRequest
  ): Promise<BulkSaveResponse | null> {
    try {
      const { data } = await candidateClient.post<BulkSaveResponse>(
        `/api/v1/attempts/${attemptId}/bulk-save`,
        req
      );
      return data;
    } catch {
      return null; // Never crash the test for a save failure
    }
  },

  /** Sync server-side timer. Returns force_submit=true if time is up. */
  async heartbeat(
    attemptId: string,
    req: HeartbeatRequest
  ): Promise<HeartbeatResponse | null> {
    try {
      const { data } = await candidateClient.post<HeartbeatResponse>(
        `/api/v1/attempts/${attemptId}/heartbeat`,
        req
      );
      return data;
    } catch {
      return null;
    }
  },

  /** Submit the test. Idempotent — safe to call multiple times. */
  async submit(
    attemptId: string,
    req: SubmitAttemptRequest
  ): Promise<SubmitAttemptResponse> {
    const { data } = await candidateClient.post<SubmitAttemptResponse>(
      `/api/v1/attempts/${attemptId}/submit`,
      req,
      { timeout: 30_000 }
    );
    return data;
  },

  /** Log a suspicious integrity event. Never throws. */
  async logEvent(
    attemptId: string,
    event: SuspiciousEventRequest
  ): Promise<void> {
    try {
      await candidateClient.post(`/api/v1/attempts/${attemptId}/event`, event);
    } catch {
      // Integrity logging must never interrupt the test
    }
  },

  /**
   * Hard-terminate this attempt on an integrity violation (tab switch, etc).
   * Retries once on network failure — the caller locks the UI client-side
   * regardless of whether this ultimately succeeds, so a dropped connection
   * can't let the candidate keep going.
   */
  async terminate(
    attemptId: string,
    req: TerminateAttemptRequest
  ): Promise<TerminateAttemptResponse | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data } = await candidateClient.post<TerminateAttemptResponse>(
          `/api/v1/attempts/${attemptId}/terminate`,
          req
        );
        return data;
      } catch {
        // Retry once, then give up — caller already locked the UI locally.
      }
    }
    return null;
  },
};
