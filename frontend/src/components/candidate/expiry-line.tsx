"use client";

import { Clock } from "lucide-react";
import { useSyncExternalStore } from "react";
import { fill, type CandidateCopy } from "@/lib/cms/candidate-copy";

const noop = () => () => {};

/** Expiry in the candidate's own time zone. The server render shows UTC until the browser takes over. */
export function ExpiryLine({ iso, copy }: { iso: string; copy: CandidateCopy["invitationLanding"] }) {
  const view = useSyncExternalStore(
    noop,
    () => describe(iso, undefined),
    () => describe(iso, "UTC"),
  );
  const [hours, when] = view.split("|");
  const h = Number(hours);
  const urgent = h < 12;
  return (
    <p className={`flex items-start gap-2 text-base ${urgent ? "text-warning" : "text-ink-muted"}`}>
      <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {urgent ? `${fill(copy.expiresInLabel, { hours: h })}. ` : ""}
        {fill(copy.validUntilLabel, { expiresAt: when })}.
      </span>
    </p>
  );
}

// A string snapshot keeps useSyncExternalStore's equality check stable between renders.
function describe(iso: string, timeZone: string | undefined) {
  const d = new Date(iso);
  const hours = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 3_600_000));
  const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short", timeZone }).format(d);
  return `${hours}|${when}`;
}
