/**
 * Sectioned exam API client (Master Prompt 2/3) — candidate side.
 *
 * Mirrors attempts.ts's pattern: calls go through the public candidate
 * proxy (/api/candidate), no admin session, no internal token in the
 * browser. Since A8-4 the magic-link token never reaches client JS —
 * it lives in an httpOnly cookie and the proxy injects it upstream
 * (X-Attempt-Token header, and the /start body token). Section
 * save/heartbeat/event/terminate still go through the EXISTING
 * attemptsApi, unchanged.
 */

import axios from "axios";
import type {
  ExamSectionResponse,
  ExamStatusResponse,
  ExamSubmitResponse,
  SectionSubmitResponse,
  SectionType,
} from "@/types/exam";
import type { SaveAnswerRequest } from "@/types/attempt";

const candidateClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CANDIDATE_API_URL ?? "/api/candidate",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

export const candidateExamsApi = {
  /** Start (or resume) the sectioned exam. Idempotent — assigns locked
   * questions from the bank on first call only. Returns the current section. */
  async start(): Promise<ExamSectionResponse> {
    const { data } = await candidateClient.post<ExamSectionResponse>(
      "/api/v1/candidate-exams/start",
      {}
    );
    return data;
  },

  /** Get the current (or resumed) section — for page-refresh resume. */
  async getCurrentSection(examAttemptId: string): Promise<ExamSectionResponse> {
    const { data } = await candidateClient.get<ExamSectionResponse>(
      `/api/v1/candidate-exams/${examAttemptId}/current`
    );
    return data;
  },

  /** Submit one section. answers is the final-answers snapshot for THIS
   * section only (same shape attemptsApi.submit uses for a single test). */
  async submitSection(
    examAttemptId: string,
    sectionType: SectionType,
    answers: SaveAnswerRequest[],
    autoSubmitted: boolean
  ): Promise<SectionSubmitResponse> {
    const { data } = await candidateClient.post<SectionSubmitResponse>(
      `/api/v1/candidate-exams/${examAttemptId}/section/${sectionType}/submit`,
      { answers, auto_submitted: autoSubmitted },
      { timeout: 30_000 }
    );
    return data;
  },

  /** Idempotent final-submission confirmation, once every section is submitted. */
  async submitExam(examAttemptId: string): Promise<ExamSubmitResponse> {
    const { data } = await candidateClient.post<ExamSubmitResponse>(
      `/api/v1/candidate-exams/${examAttemptId}/submit`,
      {}
    );
    return data;
  },

  /** Exam-level status and scores (once evaluated). */
  async getStatus(examAttemptId: string): Promise<ExamStatusResponse> {
    const { data } = await candidateClient.get<ExamStatusResponse>(
      `/api/v1/candidate-exams/${examAttemptId}/status`
    );
    return data;
  },
};
