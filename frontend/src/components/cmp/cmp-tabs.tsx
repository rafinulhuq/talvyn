import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "site", label: "Site", href: "/dashboard/cmp?doc=site" },
  { id: "home", label: "Homepage", href: "/dashboard/cmp?doc=home" },
  { id: "candidate_experience", label: "Candidate pages", href: "/dashboard/cmp?doc=candidate_experience" },
  { id: "invitation_email", label: "Invitation email", href: "/dashboard/cmp?doc=invitation_email" },
  { id: "blog", label: "Blog", href: "/dashboard/cmp/blog" },
];

export function CmpTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Website content sections" className="border-b border-line">
      <ul className="flex flex-wrap gap-x-5">
        {TABS.map((t) => (
          <li key={t.id}>
            <Link href={t.href} aria-current={t.id === current ? "page" : undefined} className={cn("-mb-px inline-flex h-10 items-center border-b-2 text-base", t.id === current ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
