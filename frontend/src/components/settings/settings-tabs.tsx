import Link from "next/link";
import { cn } from "@/lib/cn";

export function SettingsTabs({ tabs, current }: { tabs: { id: string; label: string }[]; current: string }) {
  return (
    <nav aria-label="Settings sections" className="border-b border-line">
      <ul className="flex gap-5">
        {tabs.map((t) => (
          <li key={t.id}>
            <Link
              href={`/dashboard/settings?tab=${t.id}`}
              aria-current={t.id === current ? "page" : undefined}
              className={cn("-mb-px inline-flex h-10 items-center border-b-2 text-base", t.id === current ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
