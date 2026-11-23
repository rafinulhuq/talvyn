"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchParamInput } from "@/components/ui/search-param-input";

const ANY = "__any__";

/** Filters live in the URL so a filtered view can be bookmarked and shared. */
export function InboxFilters({
  roles,
}: {
  roles: { id: string; title: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value && value !== ANY) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  const pick = (
    key: string,
    label: string,
    options: [string, string][],
    width = "w-44",
  ) => (
    // Width on a wrapper: the trigger is w-full by design, and cn() doesn't merge conflicting classes.
    <div className={width}>
      <Select value={params.get(key) ?? ANY} onValueChange={(v) => set(key, v)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{label}: any</SelectItem>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const active = ["q", "jd", "status", "rec", "integrity", "from", "to"].some(
    (k) => params.get(k),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchParamInput
        label="Search results"
        placeholder="Search by candidate name or email"
      />
      {roles.length > 0 &&
        pick(
          "jd",
          "Role",
          roles.map((r) => [r.id, r.title]),
          "w-56",
        )}
      {pick("status", "Status", [
        ["SUBMITTED", "Waiting for scoring"],
        ["EVALUATED", "Scored"],
        ["TERMINATED", "Ended for integrity"],
      ])}
      {pick("rec", "Recommendation", [
        ["STRONG_HIRE", "Strong hire"],
        ["HIRE", "Hire"],
        ["MAYBE", "Maybe"],
        ["NO_HIRE", "No hire"],
      ], "w-56")}
      {pick("integrity", "Integrity", [
        ["clean", "No violations"],
        ["violation", "Violation"],
      ])}
      <label className="flex items-center gap-1.5 text-sm text-ink-muted">
        From
        <Input
          type="date"
          className="w-36"
          value={params.get("from") ?? ""}
          onChange={(e) => set("from", e.target.value || null)}
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-ink-muted">
        To
        <Input
          type="date"
          className="w-36"
          value={params.get("to") ?? ""}
          onChange={(e) => set("to", e.target.value || null)}
        />
      </label>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace(path, { scroll: false })}
        >
          <X aria-hidden className="size-3.5" /> Clear filters
        </Button>
      )}
    </div>
  );
}
