"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Sections of one job description. Links, not tabs: each is its own page and URL. */
export function JdSubnav({ jdId }: { jdId: string }) {
  const path = usePathname();
  const base = `/dashboard/jds/${jdId}`;
  const items = [
    { label: "Overview", href: base, active: path === base },
    { label: "Tests", href: `${base}/tests`, active: path.startsWith(`${base}/tests`) },
    { label: "Candidates", href: `${base}/candidates`, active: path.startsWith(`${base}/candidates`) || path.startsWith(`${base}/invite`) },
    { label: "Results", href: `${base}/results`, active: path.startsWith(`${base}/results`) },
    { label: "Question bank", href: `${base}/question-bank`, active: path.startsWith(`${base}/question-bank`) },
  ];
  return (
    <nav aria-label="Job description sections" className="-mt-2 border-b border-line">
      <ul className="flex gap-5">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-10 items-center border-b-2 text-base transition-colors",
                i.active ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
