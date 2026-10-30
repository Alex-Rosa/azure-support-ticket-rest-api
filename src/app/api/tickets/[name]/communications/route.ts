import type { NextRequest } from "next/server";
import { z } from "zod";
import { ArmError, createCommunicationSchema, newResourceName } from "@/lib/azure-support";
import { guardedWrite, handle, parseBody, scopeFrom } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

type Ctx = RouteContext<"/api/tickets/[name]/communications">;

export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const { name } = await ctx.params;
  const items = await getSupportClient(req).listCommunications(scopeFrom(req), name);
  items.sort((a, b) => (b.properties.createdDate ?? "").localeCompare(a.properties.createdDate ?? ""));
  return Response.json(items);
});

const envelope = z.object({
  confirm: z.boolean().optional(),
  name: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  input: createCommunicationSchema,
});

export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const { name: ticketName } = await ctx.params;
  const scope = scopeFrom(req);
  const { confirm, name: requestedName, input } = await parseBody(req, envelope);
  const client = getSupportClient(req);
  const name = requestedName ?? newResourceName("message");

  return guardedWrite(
    confirm,
    () => client.planCreateCommunication(scope, ticketName, name, input),
    async () => {
      const availability = await client.checkCommunicationName(scope, ticketName, name);
      if (!availability.nameAvailable) {
        throw new ArmError(409, "NameUnavailable", availability.message ?? `Communication name ${name} is not available.`);
      }
      return client.createCommunication(scope, ticketName, name, input);
    },
    name,
  );
});
