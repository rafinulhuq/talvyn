import { requireServerEnv } from "@/lib/env";
import {
  defaultCandidateExperienceContent,
  defaultHomeContent,
  defaultPublicCmsContent,
  defaultSiteContent,
  type PublicCmsContent,
} from "@/lib/cms/content";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T;
  }
  if (!isPlainRecord(base)) {
    return (override === undefined || override === null ? base : override) as T;
  }
  if (!isPlainRecord(override)) {
    return base;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in merged ? deepMerge(merged[key], value) : value;
  }
  return merged as T;
}

export async function getPublicCmsContent(): Promise<PublicCmsContent> {
  try {
    const fastapiInternalUrl = requireServerEnv("FASTAPI_INTERNAL_URL", "http://localhost:8000");
    const res = await fetch(`${fastapiInternalUrl}/api/v1/cmp/public/content`, {
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `[cmp] Public content fetch returned ${res.status}; serving default content.`
      );
      return defaultPublicCmsContent;
    }
    const data = (await res.json()) as Partial<PublicCmsContent>;
    return {
      site: deepMerge(defaultSiteContent, data.site),
      home: deepMerge(defaultHomeContent, data.home),
      candidate_experience: deepMerge(
        defaultCandidateExperienceContent,
        data.candidate_experience
      ),
    };
  } catch (error) {
    console.warn(
      "[cmp] Public content fetch failed; serving default content.",
      error instanceof Error ? error.message : error
    );
    return defaultPublicCmsContent;
  }
}
