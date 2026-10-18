/**
 * TypeScript types for Job Description module.
 * These match the FastAPI Pydantic schemas in backend/app/schemas/jd.py
 */

import type { FileType, GenerationStatus, JdSource, ParseStatus } from "./index";

// ─── Core types ───────────────────────────────────────────────

export interface DifficultyDistribution {
  easy_percent: number;
  medium_percent: number;
  hard_percent: number;
}

export interface JdExtractedData {
  id: string;
  jd_id: string;
  job_title: string | null;
  seniority_level: string | null;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  tools_technologies: string[];
  responsibilities: string[];
  recommended_test_topics: string[];
  difficulty_distribution: DifficultyDistribution;
  extracted_at: string;
}

export interface JobDescription {
  id: string;
  uploaded_by: string;
  source: JdSource;
  original_filename: string;
  file_type: FileType | null;
  parse_status: ParseStatus;
  generation_status: GenerationStatus;
  raw_text: string | null;
  created_at: string;
  updated_at: string;
  extracted_data: JdExtractedData | null;
}

export interface JobDescriptionListItem {
  id: string;
  uploaded_by: string;
  source: JdSource;
  original_filename: string;
  file_type: FileType | null;
  parse_status: ParseStatus;
  generation_status: GenerationStatus;
  created_at: string;
  updated_at: string;
  job_title: string | null;
  seniority_level: string | null;
}

// ─── API Response types ───────────────────────────────────────

export interface JobDescriptionListResponse {
  items: JobDescriptionListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface JdUploadResponse {
  id: string;
  original_filename: string;
  file_type: FileType;
  parse_status: ParseStatus;
  message: string;
}

export interface JdParseStatusResponse {
  id: string;
  parse_status: ParseStatus;
  generation_status: GenerationStatus;
  has_extracted_data: boolean;
  has_tests: boolean;
  error_message: string | null;
}

// ─── Skill extraction ─────────────────────────────────────────

export interface DifficultyDistribution {
  easy_percent: number;
  medium_percent: number;
  hard_percent: number;
}

export interface AnalyzeJdResponse {
  jd_id: string;
  job_title: string | null;
  seniority_level: string | null;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  tools_technologies: string[];
  responsibilities: string[];
  recommended_test_topics: string[];
  difficulty_distribution: DifficultyDistribution;
  is_reanalysis: boolean;
  message: string;
}

export interface AnalyzeJdErrorResponse {
  jd_id: string;
  error_code: string;
  message: string;
}
