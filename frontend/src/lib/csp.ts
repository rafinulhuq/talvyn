/**
 * Content-Security-Policy for HTML pages, applied per request by src/proxy.ts.
 *
 * Scripts: a fresh nonce per request plus 'strict-dynamic'. Next.js reads the
 * nonce from the request's CSP header and adds it to its own scripts; scripts
 * those load are trusted transitively. Everything else, including injected
 * inline scripts, is blocked. This is the part that stops XSS.
 *
 * Styles allow 'unsafe-inline': the UI uses inline style attributes (charts,
 * heatmaps, Radix positioning), and browsers ignore 'unsafe-inline' whenever a
 * style nonce is present, so a nonce isn't an option there. Style injection is
 * a much weaker vector than script injection.
 */
export function buildCsp(nonce: string, opts: { dev?: boolean; https?: boolean; sentryOrigin?: string | null } = {}): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    // 'wasm-unsafe-eval': the PDF/DOCX parser compiles WebAssembly in the browser.
    // 'unsafe-eval' only in dev, where React uses eval for error stacks.
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    // https: so blog posts can show images hosted elsewhere.
    ["img-src", "'self'", "data:", "blob:", "https:"],
    ["font-src", "'self'", "data:"],
    ["connect-src", "'self'", ...(opts.sentryOrigin ? [opts.sentryOrigin] : [])],
    ["worker-src", "'self'", "blob:"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  // Only over HTTPS: on plain-http local runs it would break every asset.
  if (opts.https) directives.push(["upgrade-insecure-requests"]);
  return directives.map((d) => d.join(" ")).join("; ");
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Origin of a Sentry/GlitchTip DSN ("https://key@host/1" → "https://host"), or null. */
export function dsnOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}
