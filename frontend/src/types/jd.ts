// Mirrors backend/app/schemas/jd.py
export type ParseStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";
export type GenerationStatus = "IDLE" | "DRAFTING" | "EXTRACTING" | "GENERATING" | "READY" | "FAILED";
export type JdSource = "UPLOADED" | "GENERATED";

export type JdExtractedData = {
  id: string;
  jd_id: string;
  job_title: string | null;
  seniority_level: string | null;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  tools_technologies: string[];
  responsibilities: string[];
  recommended_test_topics: string[];
  difficulty_distribution: Record<string, unknown>;
  extracted_at: string;
};

export type JobDescription = {
  id: string;
  uploaded_by: string;
  source: JdSource;
  original_filename: string;
  file_type: "PDF" | "DOCX" | null;
  parse_status: ParseStatus;
  generation_status: GenerationStatus;
  raw_text: string | null;
  created_at: string;
  updated_at: string;
  extracted_data: JdExtractedData | null;
};

export type JobDescriptionListItem = Omit<JobDescription, "raw_text" | "extracted_data"> & {
  job_title: string | null;
  seniority_level: string | null;
};

export type Paginated<T> = { items: T[]; total: number; page: number; page_size: number; total_pages: number };

export type JdStatus = {
  id: string;
  parse_status: ParseStatus;
  generation_status: GenerationStatus;
  has_extracted_data: boolean;
  has_tests: boolean;
  error_message: string | null;
};
