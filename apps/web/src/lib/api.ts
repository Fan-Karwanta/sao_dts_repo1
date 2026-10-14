// Empty string = same-origin; production proxies /api and /socket.io through
// Next.js rewrites (API_PROXY_ORIGIN) because Safari blocks cross-site cookies.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD"]);
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const MAX_RATE_LIMIT_RETRIES = 3;

function retryAfterMs(response: Response, attempt: number) {
  const header = Number(response.headers.get("Retry-After"));
  const base = Number.isFinite(header) && header > 0 ? header * 1000 : 1000 * 2 ** attempt;
  return Math.min(base, 10_000) + Math.random() * 300;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = SAFE_METHODS.has(method) ? 2 : 1;
  for (let attempt = 0, limited = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      // One delayed retry lets a cold-starting backend (Hostinger sleeps idle
      // Node apps) come up instead of surfacing a transient gateway error.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    try {
      const send = () =>
        fetch(`${API_URL}/api${path}`, {
          ...init,
          credentials: "include",
          headers: {
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
        });
      let response = await send();
      // A 429 means the request was rejected before processing, so retrying
      // with backoff is safe for every method (including saves).
      while (response.status === 429 && limited < MAX_RATE_LIMIT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response, limited++)));
        response = await send();
      }
      if (!RETRYABLE_STATUS.has(response.status) || attempt + 1 === attempts) {
        return response;
      }
    } catch (error) {
      if (attempt + 1 === attempts) throw error;
    }
  }
  throw new Error("Unreachable");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | {
          message?: string | string[];
          code?: string;
          issues?: { path?: string; message?: string }[];
        }
      | null;
    const base = Array.isArray(payload?.message)
      ? payload.message.join(", ")
      : (payload?.message ??
        (response.status === 429
          ? "Too many requests — please wait a moment and try again"
          : RETRYABLE_STATUS.has(response.status)
            ? "The server is temporarily unavailable — please try again"
            : "Request failed"));
    const details = (payload?.issues ?? [])
      .map((issue) =>
        issue.path ? `${issue.path}: ${issue.message}` : issue.message,
      )
      .filter(Boolean)
      .join("; ");
    throw new ApiError(
      details ? `${base}: ${details}` : base,
      response.status,
      payload?.code,
    );
  }
  return response.json() as Promise<T>;
}
