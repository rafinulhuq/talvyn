export interface SearchResult {
  kind: "candidate" | "jd" | "test" | "result" | string;
  title: string;
  subtitle: string | null;
  href: string;
  meta: string | null;
}

export interface SearchResponse {
  query: string;
  items: SearchResult[];
}
