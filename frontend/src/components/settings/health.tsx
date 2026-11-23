import { CircleCheck, CircleAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

type Check = { status: string; latency_ms?: number; detail?: string | null; action?: string | null; note?: string | null; [k: string]: unknown };
export type Readiness = { status: string; service?: string; version?: string; checks: Record<string, Check> };

const NAME: Record<string, string> = {
  database: "Database",
  redis: "Queue (Redis)",
  worker: "Background worker",
  ollama: "AI model server",
  storage: "File storage",
  cors: "Allowed origins",
  email: "Email",
  ai_detection: "AI-writing detection",
  magic_links: "Candidate links",
  public_url: "Public address",
};

/** Live readiness from the backend. Only real checks; nothing hard-coded. */
export function Health({ data }: { data: Readiness | null }) {
  if (!data) return <p className="text-base text-ink-muted">The Talvyn service didn&apos;t answer the health check. It may be down or restarting.</p>;
  const entries = Object.entries(data.checks ?? {});
  const attention = entries.filter(([, c]) => c.status !== "ok").length;
  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-3 text-base text-ink-muted">
        <Badge tone={attention === 0 ? "success" : data.status === "ok" ? "warning" : "danger"} dot>
          {attention === 0 ? "All systems working" : `${attention} ${attention === 1 ? "check needs" : "checks need"} attention`}
        </Badge>
        {data.version && <span>Version {data.version}</span>}
      </p>
      <ul className="overflow-hidden rounded-panel border border-line bg-surface">
        {entries.map(([key, c]) => {
          const ok = c.status === "ok";
          const warn = c.status === "warning";
          const Icon = ok ? CircleCheck : warn ? TriangleAlert : CircleAlert;
          const note = c.detail ?? c.note;
          return (
            <li key={key} className="flex items-start gap-3 border-b border-line px-5 py-3.5 last:border-0">
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", ok ? "text-success" : warn ? "text-warning" : "text-danger")} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base font-medium text-ink">{NAME[key] ?? key}</span>
                  <span className="text-sm text-ink-muted">
                    {ok ? "Working" : warn ? "Warning" : "Not working"}
                    {typeof c.latency_ms === "number" ? `, ${Math.round(c.latency_ms)} ms` : ""}
                  </span>
                </p>
                {note && !ok && <p className="mt-0.5 break-words text-sm text-ink-muted">{String(note)}</p>}
                {c.action && !ok && <p className="mt-0.5 text-sm text-ink">{String(c.action)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
