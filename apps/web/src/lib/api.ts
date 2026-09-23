export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
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
      : (payload?.message ?? "Request failed");
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
