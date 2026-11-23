/**
 * Browser-side API client. Every call goes through the authenticated
 * /api/proxy route (which attaches the internal secret and actor id), so the
 * browser never talks to FastAPI directly.
 *
 * Never throws: returns a discriminated result so callers must handle errors.
 */
export type ApiError = { code: string; message: string; details?: Record<string, unknown> };
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

const FALLBACK: Record<number, string> = {
  0: "You appear to be offline. Check your connection and try again.",
  401: "Your session has ended. Sign in again.",
  403: "You don't have access to this.",
  404: "We couldn't find that.",
  429: "Too many requests. Wait a moment and try again.",
};

function toError(status: number, body: unknown): ApiError {
  const b = (body ?? {}) as { error?: unknown; detail?: unknown };
  if (b.error && typeof b.error === "object") {
    const e = b.error as Partial<ApiError>;
    if (typeof e.message === "string") return { code: e.code ?? "ERROR", message: e.message, details: e.details };
  }
  if (typeof b.detail === "string") return { code: "ERROR", message: b.detail };
  // FastAPI validation errors: detail is an array of { msg }.
  if (Array.isArray(b.detail) && typeof b.detail[0]?.msg === "string") return { code: "VALIDATION_ERROR", message: b.detail[0].msg };
  return { code: "ERROR", message: FALLBACK[status] ?? "Something went wrong. Try again." };
}

export async function api<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown; base?: "/api/proxy" | "/api/candidate" | "/api/public" | "" } = {},
): Promise<ApiResult<T>> {
  const { body, base = "/api/proxy", headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...rest,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, status: 0, error: toError(0, null) };
  }
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && base === "/api/proxy" && typeof window !== "undefined") {
      // Session expired mid-use: send them to sign in, then back here.
      const back = encodeURIComponent(window.location.pathname + window.location.search);
      // Full navigation on purpose: this runs outside React (no router), and a fresh load clears stale client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?callbackUrl=${back}`);
    }
    return { ok: false, status: res.status, error: toError(res.status, data) };
  }
  return { ok: true, status: res.status, data: data as T };
}
