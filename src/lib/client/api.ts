// Browser-side helpers for calling the app's own /api route handlers.
import type { PlannedRequest } from "@/lib/azure-support/client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? `Http${res.status}`, err.message ?? res.statusText, err.details);
  }
  return data as T;
}

/** Appends ?scope=… (and any extra params) to an app API path. */
export function withScope(path: string, scope: string, params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams({ scope });
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  return `${path}?${search}`;
}

export type WriteResponse<T> = { dryRun: true; reason: string; request: PlannedRequest; name?: string } | { dryRun: false; result: T };

export interface Session {
  authMode: "cli" | "service-principal" | "user";
  requestedAuthMode: string;
  authWarning?: string;
  liveMode: boolean;
  classifyEnabled: boolean;
  user: { username: string; name?: string } | null;
  signInRequired: boolean;
}

/** Turns validation issues from the API into one readable line each. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "ValidationFailed" && Array.isArray(err.details)) {
      return err.details
        .map((i: { path?: (string | number)[]; message?: string }) => `${(i.path ?? []).join(".") || "input"}: ${i.message}`)
        .join("\n");
    }
    return `${err.message} (${err.code})`;
  }
  return (err as Error)?.message ?? String(err);
}
