"use client";

import { CheckCircle, XCircle } from "lucide-react";

type CriteriaListProps = {
  title: string;
  items: string[];
  variant: "matched" | "missed";
};

export function CriteriaList({ title, items, variant }: CriteriaListProps) {
  const Icon = variant === "matched" ? CheckCircle : XCircle;
  const textColor = variant === "matched" ? "text-emerald-950" : "text-red-950";
  const iconColor = variant === "matched" ? "text-emerald-700" : "text-red-700";

  return (
    <div className="font-mono">
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">// {title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((c) => (
          <li key={c} className={`flex items-start gap-2 text-xs font-bold ${textColor}`}>
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
