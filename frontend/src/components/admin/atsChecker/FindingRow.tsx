import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { ATS_SEVERITY_CONFIG, type ATSFinding, type ATSSeverity } from "@/types/ats";

const SEVERITY_ICON: Record<
  ATSSeverity,
  { icon: typeof AlertTriangle; className: string }
> = {
  CRITICAL: { icon: XCircle, className: "text-danger" },
  WARNING: { icon: AlertTriangle, className: "text-warning-dark" },
  INFO: { icon: Lightbulb, className: "text-slate-400" },
  GOOD: { icon: CheckCircle2, className: "text-success" },
};

export function FindingRow({ finding }: { finding: ATSFinding }) {
  const { icon: Icon, className } = SEVERITY_ICON[finding.severity];
  const severity = ATS_SEVERITY_CONFIG[finding.severity];
  return (
    <li className="flex gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
      <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", className)} />
      <div className="min-w-0">
        {/* Severity is spelled out, not left to icon and color alone. */}
        <p className="text-sm text-slate-800 dark:text-slate-200">
          <span
            className={clsx(
              "mr-1.5 text-[11px] font-semibold uppercase tracking-wide",
              className
            )}
          >
            {severity.label}
          </span>
          {finding.message}
        </p>
        {finding.suggestion && (
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {finding.suggestion}
          </p>
        )}
      </div>
    </li>
  );
}
