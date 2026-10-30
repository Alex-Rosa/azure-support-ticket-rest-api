import "server-only";
// Shared plumbing for route handlers: error mapping, scope parsing and the
// dry-run guard for anything that writes to Azure Support.
import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ArmError, parseScope, type PlannedRequest, type Scope } from "@/lib/azure-support";
import { getConfig } from "./config";

export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

export function errorResponse(err: unknown): Response {
  if (err instanceof ArmError) {
    return Response.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return Response.json(
      { error: { code: "ValidationFailed", message: "Request validation failed.", details: err.issues } },
      { status: 400 },
    );
  }
  if (err instanceof RangeError || err instanceof SyntaxError) {
    return Response.json({ error: { code: "BadRequest", message: err.message } }, { status: 400 });
  }
  console.error(err);
  return Response.json({ error: { code: "InternalError", message: (err as Error)?.message ?? "Unexpected error." } }, { status: 500 });
}

/** Wraps a handler so thrown errors become JSON error responses. */
export function handle<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function scopeFrom(req: NextRequest): Scope {
  return parseScope(req.nextUrl.searchParams.get("scope"));
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await req.json());
}

export type DryRunResult = { dryRun: true; reason: string; request: PlannedRequest; name?: string };

/**
 * Writes only go to Azure when SUPPORT_LIVE_MODE=true AND the request carries
 * confirm: true. Otherwise the planned request is returned for review.
 */
export async function guardedWrite<R>(
  confirm: boolean | undefined,
  plan: () => PlannedRequest,
  execute: () => Promise<R>,
  /** Generated resource name, echoed back so the confirm call can reuse it. */
  name?: string,
): Promise<Response> {
  const { liveMode } = getConfig();
  if (!liveMode || confirm !== true) {
    const reason = liveMode
      ? "Not confirmed: review the request, then submit again to send it."
      : "Dry-run mode: SUPPORT_LIVE_MODE is not enabled, so nothing was sent to Azure.";
    return Response.json({ dryRun: true, reason, request: plan(), name } satisfies DryRunResult);
  }
  return Response.json({ dryRun: false, result: await execute() });
}
