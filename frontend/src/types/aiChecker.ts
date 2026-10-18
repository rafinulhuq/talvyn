import type {
  AIDetectionConfidence,
  AIDetectionRecommendation,
} from "./evaluation";

export interface AICheckRequest {
  text: string;
  title?: string | null;
}

export interface ExtractedTextResponse {
  text: string;
}

export interface AICheckResponse {
  estimated_ai_percentage: number;
  confidence: AIDetectionConfidence;
  suspicious_phrases: string[];
  explanation: string;
  recommendation: AIDetectionRecommendation;
  chunks_analyzed: number;
  word_count: number;
  character_count: number;
  disclaimer: string;
}

export type AICheckJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface AICheckJobAcceptedResponse {
  job_id: string;
  status: "QUEUED";
  detail: string;
}

export interface AICheckJobStatusResponse {
  job_id: string;
  status: AICheckJobStatus;
  detail: string;
  result: AICheckResponse | null;
  error: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
