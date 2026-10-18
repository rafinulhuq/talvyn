/**
 * Question bank API functions (Master Prompt 2/3) — admin side.
 * All calls to /api/v1/jd/{jd_id}/question-bank/*, via the authenticated
 * admin proxy (apiClient), same as tests.ts / jd.ts.
 */

import { apiClient, type ApiResult } from "./client";
import type {
  BankStatusResponse,
  GenerateBankRequest,
  ReviewBankRequest,
  UpdateBankConfigRequest,
} from "@/types/exam";

export const questionBankApi = {
  /** Generate a reusable question bank for this JD. Long-running —
   * generates 3 section tests in many small batches (local) or one larger
   * call per section (GLM, which can run long on a freshly-loaded 9B+
   * model). 600s gives real headroom; the Next.js proxy and the
   * production host-nginx in front of it must both allow at least this
   * long too (see api/proxy/[...path]/route.ts's LONG_TIMEOUT and
   * docs/deployment.md's proxy_read_timeout) or one of them will return a
   * 504/timeout before this ever does. */
  async generate(jdId: string, req: GenerateBankRequest = {}): Promise<ApiResult<BankStatusResponse>> {
    return apiClient.post<BankStatusResponse>(
      `/api/v1/jd/${jdId}/question-bank/generate`,
      req,
      { timeout: 600_000 }
    );
  },

  /** Archive the current bank and generate a fresh one. */
  async regenerate(jdId: string, req: GenerateBankRequest = {}): Promise<ApiResult<BankStatusResponse>> {
    return apiClient.post<BankStatusResponse>(
      `/api/v1/jd/${jdId}/question-bank/regenerate`,
      req,
      { timeout: 600_000 }
    );
  },

  /** Get the current bank status and per-section counts. */
  async getStatus(jdId: string): Promise<ApiResult<BankStatusResponse>> {
    return apiClient.get<BankStatusResponse>(`/api/v1/jd/${jdId}/question-bank/status`);
  },

  /** Admin reviews and approves a READY bank, making it assignable to candidates. */
  async review(jdId: string, req: ReviewBankRequest = {}): Promise<ApiResult<BankStatusResponse>> {
    return apiClient.post<BankStatusResponse>(`/api/v1/jd/${jdId}/question-bank/review`, req);
  },

  /** Update per-job exam config (section weights, bank size targets). */
  async updateConfig(
    jdId: string,
    req: UpdateBankConfigRequest
  ): Promise<ApiResult<{ jd_id: string; exam_config_json: Record<string, unknown> }>> {
    return apiClient.patch(`/api/v1/jd/${jdId}/question-bank/config`, req);
  },
};
