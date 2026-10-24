/**
 * SkillsPanel
 *
 * Renders the complete extracted skills from a JD in a structured layout:
 * - Must-have skills (blue)
 * - Nice-to-have skills (slate)
 * - Tools & technologies (purple)
 * - Responsibilities (prose list)
 * - Recommended test topics (green)
 * - Difficulty distribution (visual bar)
 */

import { clsx } from "clsx";
import { Badge } from "@/components/ui/Badge";
import type { JdExtractedData } from "@/types/jd";

interface SkillsPanelProps {
  data: JdExtractedData;
}

export function SkillsPanel({ data }: SkillsPanelProps) {
  const { difficulty_distribution: dist } = data;
  const hasDifficulty =
    dist &&
    (dist.easy_percent > 0 ||
      dist.medium_percent > 0 ||
      dist.hard_percent > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Must-have skills */}
      {data.must_have_skills.length > 0 && (
        <TagSection
          title="Must-Have Skills"
          subtitle={`${data.must_have_skills.length} required`}
          items={data.must_have_skills}
          badgeVariant="indigo"
        />
      )}

      {/* Nice-to-have */}
      {data.nice_to_have_skills.length > 0 && (
        <TagSection
          title="Nice-to-Have Skills"
          subtitle={`${data.nice_to_have_skills.length} preferred`}
          items={data.nice_to_have_skills}
          badgeVariant="slate"
        />
      )}

      {/* Tools & technologies */}
      {data.tools_technologies.length > 0 && (
        <TagSection
          title="Tools & Technologies"
          subtitle={`${data.tools_technologies.length} identified`}
          items={data.tools_technologies}
          badgeVariant="purple"
        />
      )}

      {/* Recommended test topics */}
      {data.recommended_test_topics.length > 0 && (
        <TagSection
          title="Recommended Test Topics"
          subtitle="Based on JD requirements"
          items={data.recommended_test_topics}
          badgeVariant="green"
        />
      )}

      {/* Responsibilities — full width */}
      {data.responsibilities.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-[#121317] p-5 shadow-xs text-white lg:col-span-2">
          <SectionHeader
            title="Key Responsibilities"
            subtitle={`${data.responsibilities.length} items`}
          />
          <ul className="mt-3 flex flex-col gap-2">
            {data.responsibilities.map((r) => (
              <li key={r} className="flex items-start gap-2.5 text-xs text-white/90">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F2D74E]" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Difficulty distribution — full width */}
      {hasDifficulty && (
        <div className="rounded-xl border border-white/8 bg-[#121317] p-5 shadow-xs text-white lg:col-span-2">
          <SectionHeader
            title="Recommended Test Difficulty"
            subtitle="Used when generating assessment questions"
          />
          <div className="mt-4">
            <DifficultyBar
              easy={dist.easy_percent}
              medium={dist.medium_percent}
              hard={dist.hard_percent}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Internal components ────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
      <p className="font-display text-sm font-semibold text-white">{title}</p>
      {subtitle && (
        <p className="text-xs text-white/70">{subtitle}</p>
      )}
    </div>
  );
}

function TagSection({
  title,
  subtitle,
  items,
  badgeVariant,
}: {
  title: string;
  subtitle?: string;
  items: string[];
  badgeVariant: "blue" | "slate" | "purple" | "green" | "indigo";
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#121317] p-5 shadow-xs text-white">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="mt-3.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant={badgeVariant}>
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function DifficultyBar({
  easy,
  medium,
  hard,
}: {
  easy: number;
  medium: number;
  hard: number;
}) {
  const segments = [
    { label: "Easy", value: easy, color: "bg-emerald-500", dot: "bg-emerald-500" },
    { label: "Medium", value: medium, color: "bg-amber-500", dot: "bg-amber-500" },
    { label: "Hard", value: hard, color: "bg-rose-500", dot: "bg-rose-500" },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={clsx("h-full transition-[width] duration-300", seg.color)}
            style={{ width: `${seg.value}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <span className={clsx("h-2.5 w-2.5 rounded-full", seg.dot)} />
            <span className="font-medium text-slate-700 dark:text-slate-300">{seg.label}:</span>
            <span className="text-slate-500">{seg.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

