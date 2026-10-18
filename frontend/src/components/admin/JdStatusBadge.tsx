/**
 * Maps a JD ParseStatus to a visual badge with appropriate color and label.
 */

import { Badge } from "@/components/ui/Badge";
import type { ParseStatus } from "@/types/index";

interface JdStatusBadgeProps {
  status: ParseStatus;
  showDot?: boolean;
}

const statusConfig: Record<
  ParseStatus,
  { label: string; variant: "blue" | "green" | "yellow" | "red" | "slate"; dot?: boolean }
> = {
  PENDING:    { label: "Pending",    variant: "slate",  dot: true },
  PROCESSING: { label: "Processing", variant: "blue",   dot: true },
  DONE:       { label: "Parsed",     variant: "green",  dot: false },
  FAILED:     { label: "Failed",     variant: "red",    dot: false },
};

export function JdStatusBadge({ status, showDot = true }: JdStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} dot={showDot && config.dot}>
      {config.label}
    </Badge>
  );
}
