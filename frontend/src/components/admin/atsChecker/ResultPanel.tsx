import { ChevronDown, Mail, MapPin, Phone, Link as LinkIcon } from "lucide-react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/Badge";
import { ATS_BAND_CONFIG, type ATSCheckResponse } from "@/types/ats";
import { ScoreGauge } from "./ScoreGauge";
import { CategoryBar } from "./CategoryBar";
import { FindingRow } from "./FindingRow";
import { KeywordChips } from "./KeywordChips";

export function ResultPanel({ result }: { result: ATSCheckResponse }) {
  const band = ATS_BAND_CONFIG[result.band];
  const keyword = result.keyword_match;
  const contact = result.detected_contact;
  const actionable = result.findings.filter((f) => f.severity !== "GOOD");
  const passing = result.findings.filter((f) => f.severity === "GOOD");

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-5">
          <ScoreGauge score={result.score} color={band.color} />
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-950/40 dark:text-indigo-400">
              {band.label}
            </span>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
              {result.headline}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {result.word_count.toLocaleString()} words · ~{result.estimated_pages} page
              {result.estimated_pages === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {result.categories.map((category) => (
            <CategoryBar
              key={category.key}
              label={category.label}
              score={category.score}
              max={category.max_score}
              summary={category.summary}
            />
          ))}
        </div>
      </div>

      {/* Keyword coverage — only meaningful when a JD or keyword list was given */}
      {keyword.source !== "NONE" && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Keyword Coverage
              {keyword.jd_title && (
                <span className="ml-1.5 font-normal text-xs text-slate-500 dark:text-slate-400">
                  vs. {keyword.jd_title}
                </span>
              )}
            </h3>
            <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {keyword.coverage_percent}%
            </span>
          </div>

          {keyword.must_have_matched.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Must-haves found
              </p>
              <KeywordChips items={keyword.must_have_matched} tone="matched" />
            </div>
          )}
          {keyword.must_have_missing.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Must-haves missing
              </p>
              <KeywordChips items={keyword.must_have_missing} tone="missing" />
            </div>
          )}
        </div>
      )}

      {/* What the parser found */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          What a Parser Would Extract
        </h3>
        <dl className="mt-3 space-y-2 text-sm">
          {(
            [
              [Mail, "Email", contact.email],
              [Phone, "Phone", contact.phone],
              [MapPin, "Location", contact.location],
              [LinkIcon, "Links", contact.links.length ? contact.links.join(", ") : null],
            ] as const
          ).map(([Icon, label, value]) => (
            <div key={label} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <dt className="w-20 shrink-0 text-xs font-medium text-slate-500">
                {label}
              </dt>
              <dd
                className={clsx(
                  "min-w-0 break-words text-xs font-medium",
                  value ? "text-slate-900 dark:text-slate-100" : "italic text-slate-400 font-normal"
                )}
              >
                {value ?? "not found"}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Detected Sections
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.detected_sections.map((section) => (
              <span
                key={section}
                className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {section}
              </span>
            ))}
            {result.missing_sections.map((section) => (
              <span
                key={section}
                className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-normal text-slate-400 line-through dark:bg-slate-850 dark:text-slate-500"
              >
                {section}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Findings */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {actionable.length > 0 ? `${actionable.length} Issue(s) to Fix` : "All Checks Passed"}
        </h3>
        {actionable.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {actionable.map((finding) => (
              <FindingRow key={`${finding.category}-${finding.message}`} finding={finding} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Every check passed. This resume is in good shape for automated screening.
          </p>
        )}

        {passing.length > 0 && (
          <details className="mt-3 border-t border-white/10 pt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-white/80 hover:text-white transition-colors">
              <ChevronDown className="mr-1 inline h-3 w-3" />
              {passing.length} check(s) passed
            </summary>
            <ul className="mt-2 space-y-1">
              {passing.map((finding) => (
                <FindingRow key={`good-${finding.category}-${finding.message}`} finding={finding} />
              ))}
            </ul>
          </details>
        )}
      </div>

      <p className="px-1 text-xs leading-relaxed text-slate-400">{result.disclaimer}</p>
    </div>
  );
}
