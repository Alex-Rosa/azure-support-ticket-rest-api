import type { NextRequest } from "next/server";
import { z } from "zod";
import { buildUpdateTicketBody, updateTicketSchema } from "@/lib/azure-support";
import { guardedWrite, handle, parseBody, scopeFrom } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

type Ctx = RouteContext<"/api/tickets/[name]">;

export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const { name } = await ctx.params;
  return Response.json(await getSupportClient(req).getTicket(scopeFrom(req), name));
});

const updateEnvelope = z.object({ confirm: z.boolean().optional(), input: updateTicketSchema });

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { name } = await ctx.params;
  const scope = scopeFrom(req);
  const { confirm, input } = await parseBody(req, updateEnvelope);
  const client = getSupportClient(req);
  const body = buildUpdateTicketBody(input);
  return guardedWrite(
    confirm,
    () => client.planUpdateTicket(scope, name, body),
    () => client.updateTicket(scope, name, body),
  );
});
