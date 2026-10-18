/**
 * InvitationStatusBadge
 * Maps InvitationStatus to a visually distinct badge.
 */

import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { InvitationStatus } from "@/types/invitation";
import { STATUS_CONFIG } from "@/types/invitation";

interface Props {
  status: InvitationStatus;
  showDescription?: boolean;
  // Soft anti-cheat signal (see public_link_service._check_duplicate_device)
  // — never auto-enforced, just surfaced here for a human to decide on.
  flaggedDuplicateDevice?: boolean;
  flaggedDuplicateReason?: string | null;
}

export function InvitationStatusBadge({
  status,
  showDescription = false,
  flaggedDuplicateDevice = false,
  flaggedDuplicateReason = null,
}: Props) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <Badge variant={config.variant} dot={config.dot}>
          {config.label}
        </Badge>
        {flaggedDuplicateDevice && (
          <span title={flaggedDuplicateReason ?? "Possible duplicate device"}>
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>
      {showDescription && (
        <span className="text-[10px] text-slate-400">{config.description}</span>
      )}
    </div>
  );
}
