import { clsx } from "clsx";

export function KeywordChips({ items, tone }: { items: string[]; tone: "matched" | "missing" }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={clsx(
            "rounded-md border px-2 py-0.5 text-xs font-medium",
            tone === "matched"
              ? "border-success/30 bg-success-light text-success-dark"
              : "border-danger/30 bg-danger-light text-danger-dark"
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
