export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Just now";
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatExpiry(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date < now) return "Expired";
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `Expires in ${diffHours}h`;
  const diffDays = Math.ceil(diffHours / 24);
  return `Expires in ${diffDays}d`;
}
