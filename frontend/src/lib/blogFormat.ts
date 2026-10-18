/** Presentation helpers shared by the public blog pages. */

export function formatPostDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function authorInitials(name: string | null): string {
  if (!name) return "OV";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "OV";
}

/**
 * Authors often start the markdown body with an H1 repeating the post
 * title; the article page already renders the title, so drop the
 * duplicate heading.
 */
export function stripLeadingTitleHeading(contentMd: string, title: string): string {
  const match = contentMd.match(/^\s*#\s+(.+?)\s*\n+/);
  if (!match) return contentMd;
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalize(match[1]) !== normalize(title)) return contentMd;
  return contentMd.slice(match[0].length);
}
